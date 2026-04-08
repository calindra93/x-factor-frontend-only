import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import fs from 'fs'
import { buildGuard } from './vite.build-guard.js'

/**
 * List of VITE_* environment variable names the app expects.
 * These are loaded from .env files and injected into the build so that
 * both static (`import.meta.env.VITE_X`) and dynamic (`import.meta.env[key]`)
 * access patterns work in dev, build, and preview modes.
 */
const EXPECTED_VITE_VARS = [
  'VITE_API_BASE',
  'VITE_BACKEND_URL',
  'VITE_FRONTEND_URL',
  'VITE_WS_URL',
  'VITE_NODE_ENV',
  'VITE_NEXT_TELEMETRY_DISABLED',
  'VITE_ENABLE_SOURCE_MAPS',
  'VITE_PORT',
  'VITE_TRUST_PROXY',
  'VITE_LOG_LEVEL',
  'VITE_HEALTHCHECK_PATH',
  'VITE_FEATURE_FLAGS',
  'VITE_EXPERIMENTS_ENABLED',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_DEBUG_PREVIEW',
  'VITE_ALLOW_HOSTED_SUPABASE',
  'VITE_BASE44_APP_ID',
  'VITE_BASE44_FUNCTIONS_VERSION',
  'VITE_BASE44_APP_BASE_URL',
]

/**
 * Build the runtime env object from loaded env vars.
 * Collects all VITE_ prefixed vars plus ensures expected vars are present.
 */
function buildRuntimeEnv(env) {
  const runtimeEnv = {}
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_')) {
      runtimeEnv[key] = env[key]
    }
  }
  for (const key of EXPECTED_VITE_VARS) {
    if (!(key in runtimeEnv)) {
      runtimeEnv[key] = env[key] || ''
    }
  }
  // Auto-populate VITE_SUPABASE_ANON_KEY from VITE_SUPABASE_KEY when missing
  // The .env convention uses VITE_SUPABASE_KEY for the anon key
  if (!runtimeEnv['VITE_SUPABASE_ANON_KEY'] && runtimeEnv['VITE_SUPABASE_KEY']) {
    runtimeEnv['VITE_SUPABASE_ANON_KEY'] = runtimeEnv['VITE_SUPABASE_KEY']
  }

  return runtimeEnv
}

/**
 * Vite plugin: injects a <script> block into index.html that sets
 * `window.__ENV` with all VITE_* values baked in at build time.
 *
 * This guarantees that even after a production build, preview or any
 * static-hosting deployment can read the env vars via `window.__ENV`.
 */
function injectRuntimeEnv(runtimeEnv) {
  const scriptContent = `window.__ENV = ${JSON.stringify(runtimeEnv)};`
  return {
    name: 'inject-runtime-env',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <script>${scriptContent}</script>`
      )
    },
  }
}

/**
 * Merge env from a sub-directory .env file (container_root) into the
 * already-loaded env object. This handles the case where the .env
 * file lives in a subdirectory like x-factor/x-factor/.env.
 */
function mergeSubdirEnv(env, subdir) {
  const envPath = path.resolve(subdir, '.env')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    // Only set if not already present (project root .env takes precedence)
    if (key.startsWith('VITE_') && !(key in env)) {
      env[key] = value
    }
  }
}

// PUBLIC_INTERFACE
/**
 * Vite configuration for the X-Factor application.
 *
 * Uses `loadEnv` to read `.env` / `.env.local` / `.env.[mode]` files,
 * then:
 * - Creates `define` entries so `import.meta.env.VITE_X` is statically replaced
 * - Injects `window.__ENV` into index.html for runtime/dynamic access
 * - Configures preview server on the same port as dev (3000)
 */
export default defineConfig(({ mode }) => {
  const projectRoot = process.cwd()

  // Load env vars from .env files for the current mode
  const env = loadEnv(mode, projectRoot, 'VITE_')

  // Also check the container_root subdirectory for .env
  mergeSubdirEnv(env, path.resolve(projectRoot, 'x-factor'))

  // Build runtime env object for HTML injection
  const runtimeEnv = buildRuntimeEnv(env)

  // Auto-populate VITE_SUPABASE_ANON_KEY from VITE_SUPABASE_KEY when missing
  // This mirrors the same fallback applied in buildRuntimeEnv for window.__ENV
  if (!env['VITE_SUPABASE_ANON_KEY'] && env['VITE_SUPABASE_KEY']) {
    env['VITE_SUPABASE_ANON_KEY'] = env['VITE_SUPABASE_KEY']
  }

  // Build `define` map so Vite statically replaces import.meta.env.VITE_X
  const defineMap = {}
  for (const key of EXPECTED_VITE_VARS) {
    const value = env[key] ?? ''
    defineMap[`import.meta.env.${key}`] = JSON.stringify(value)
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_') && !defineMap[`import.meta.env.${key}`]) {
      defineMap[`import.meta.env.${key}`] = JSON.stringify(env[key])
    }
  }

  return {
    // logLevel left at default ('info') so Vite prints its startup banner
    // (Local / Network URLs) which the preview readiness detector relies on.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [
      react(),
      buildGuard(),
      injectRuntimeEnv(runtimeEnv),
    ],
    define: defineMap,

    /**
     * Performance: force chunking for large, commonly-used dependencies.
     *
     * Recent changes introduced warnings where some modules are both statically
     * and dynamically imported (e.g., supabaseClient/base44Client), which blocks
     * Vite/Rollup from moving them into separate chunks automatically.
     *
     * Explicit manualChunks restores reasonable splitting so preview initial load
     * doesn't require parsing/executing the entire app upfront.
     */
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Keep node_modules in stable vendor buckets.
            if (id.includes('node_modules')) {
              if (id.includes('@supabase/supabase-js')) return 'vendor-supabase'
              if (id.includes('@tanstack/react-query')) return 'vendor-react-query'
              if (id.includes('react-router-dom')) return 'vendor-router'
              if (id.includes('framer-motion')) return 'vendor-motion'
              if (id.includes('recharts')) return 'vendor-charts'
              if (id.includes('leaflet') || id.includes('react-leaflet')) return 'vendor-maps'
              if (id.includes('three')) return 'vendor-three'
              if (id.includes('lucide-react') || id.includes('@radix-ui')) return 'vendor-ui'
              return 'vendor'
            }

            // Keep SDK clients out of the main entry chunk to reduce initial parse time.
            if (id.endsWith('/src/lib/supabaseClient.js')) return 'sdk-supabase-client'
            if (id.endsWith('/src/api/base44Client.js')) return 'sdk-base44-client'

            return undefined
          },
        },
      },
    },

    server: {
      port: 3000,
      host: '0.0.0.0',
      // Vite 6.x requires boolean `true` (not string 'all') to permit all hosts.
      // The internal check uses strict equality (allowedHosts === true), so a
      // string value like 'all' is silently rejected, producing 403 Forbidden
      // for proxy hostnames such as the VSCode preview proxy.
      allowedHosts: true,
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
      // Same fix as server – boolean true disables host header validation.
      allowedHosts: true,
    },
  }
})
