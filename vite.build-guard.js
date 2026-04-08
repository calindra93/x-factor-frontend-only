/**
 * Vite plugin: build guard
 *
 * Returns a no-op Vite plugin so vite.config.js can import it without error.
 * Additional build-time checks can be added here in future.
 */
export function buildGuard() {
  return {
    name: 'build-guard',
  }
}
