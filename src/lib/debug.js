const DEBUG_FLAG_KEY = 'xfactor_preview_debug';

/** @typedef {{ VITE_DEBUG_PREVIEW?: string }} DebugEnv */
/** @type {DebugEnv} */
const env = /** @type {{ env?: DebugEnv }} */ (import.meta).env ?? {};

export const isPreviewDebugEnabled = () => {
  if (typeof window === 'undefined') return false;

  const localDebug = window.localStorage?.getItem(DEBUG_FLAG_KEY) === 'true';
  const queryDebug = new URLSearchParams(window.location.search).get('debug_preview') === 'true';
  const envDebug = env.VITE_DEBUG_PREVIEW === 'true';

  return localDebug || queryDebug || envDebug;
};

export const debugLog = (...args) => {
  if (!isPreviewDebugEnabled()) return;
   
  console.log('[PreviewDebug]', ...args);
};

export const instrumentPreviewDiagnostics = () => {
  if (typeof window === 'undefined' || !isPreviewDebugEnabled()) return;

  const windowWithDiagnostics = /** @type {Window & { __previewDiagnosticsInstalled?: boolean }} */ (window);
  if (windowWithDiagnostics.__previewDiagnosticsInstalled) return;

  windowWithDiagnostics.__previewDiagnosticsInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const target = typeof args[0] === 'string' ? args[0] : args[0] && 'url' in args[0] ? args[0].url : undefined;
    try {
      const response = await originalFetch(...args);
      debugLog('fetch', { status: response.status, target, cacheControl: response.headers.get('cache-control') });
      return response;
    } catch (error) {
      const err = /** @type {{ message?: string }} */ (error);
      debugLog('fetch-error', { target, message: err?.message });
      throw error;
    }
  };

  window.addEventListener('beforeunload', () => {
    debugLog('beforeunload', { href: window.location.href });
  });

  window.addEventListener('error', (event) => {
    debugLog('window-error', { message: event.message, source: event.filename, line: event.lineno });
  });

  window.addEventListener('unhandledrejection', (event) => {
    debugLog('unhandled-rejection', { reason: String(event.reason) });
  });
};

export const shouldNavigateToPath = (currentPathname, targetPathname) => {
  if (!targetPathname) return false;
  return currentPathname !== targetPathname;
};
