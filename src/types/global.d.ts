/// <reference path="base44.d.ts" />

// Global type definitions for the entire project

/**
 * Runtime environment variables injected by the injectRuntimeEnv Vite plugin.
 * Available in preview and production builds via a <script> tag in index.html.
 */
interface Window {
  __ENV?: Record<string, string>;
}
