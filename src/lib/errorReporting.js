const STORAGE_KEY = "app_error_reports";
const ECONOMY_KEY = "app_economy_snapshots";
const MAX_REPORTS = 100;
const MAX_ECONOMY_SNAPSHOTS = 30;

// ── Severity levels ──
export const Severity = { INFO: "info", WARN: "warn", ERROR: "error", CRITICAL: "critical" };

// ── Category tags (auto-inferred when not provided) ──
const SCOPE_CATEGORY_MAP = {
  ReleaseWizard: "release",
  Studio: "studio",
  ProjectManagement: "studio",
  StatusRibbon: "turn",
  TouringAppV2: "touring",
  MerchApp: "economy",
  VidWaveApp: "social",
  window: "runtime",
  unhandledrejection: "runtime"
};

const inferCategory = (scope) => SCOPE_CATEGORY_MAP[scope] || "general";

// ── LocalStorage helpers ──
const readStore = (key, fallback = []) => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
};

const writeStore = (key, data) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (_) { /* quota exceeded — silently drop */ }
};

const readReports = () => readStore(STORAGE_KEY);
const writeReports = (reports) => writeStore(STORAGE_KEY, reports);

const serializeError = (error) => {
  if (!error) return null;
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  return { message: "Unknown error", detail: error };
};

// ── Core reporter ──
export const reportError = ({ scope, message, error, extra, severity, category } = {}) => {
  const sev = severity || (error ? Severity.ERROR : Severity.WARN);
  const cat = category || inferCategory(scope);

  const report = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    severity: sev,
    category: cat,
    scope: scope || "app",
    message: message || "Unhandled error",
    error: serializeError(error),
    extra: extra ?? null
  };

  const existing = readReports();
  const next = [report, ...existing].slice(0, MAX_REPORTS);
  writeReports(next);

  const logFn = sev === Severity.CRITICAL || sev === Severity.ERROR ? console.error : console.warn;
  logFn(`[ErrorReporting:${sev}] ${report.scope}: ${report.message}`, report);

  return report;
};

// ── Economy snapshot (call after any income/energy change to track freezes) ──
export const snapshotEconomy = ({ profileId, income, energy, inspiration, context } = {}) => {
  const snap = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    profileId,
    income,
    energy,
    inspiration,
    context: context || "unknown"
  };
  const existing = readStore(ECONOMY_KEY);
  writeStore(ECONOMY_KEY, [snap, ...existing].slice(0, MAX_ECONOMY_SNAPSHOTS));
  return snap;
};

// ── Accessors for the viewer ──
export const getErrorReports = () => readReports();
export const getEconomySnapshots = () => readStore(ECONOMY_KEY);
export const clearErrorReports = () => writeReports([]);
export const clearEconomySnapshots = () => writeStore(ECONOMY_KEY, []);

// ── Init: global listeners + console bridge ──
export const initErrorReporting = () => {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    reportError({
      scope: "window",
      message: event.message,
      error: event.error,
      severity: Severity.ERROR,
      extra: { filename: event.filename, lineno: event.lineno, colno: event.colno }
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError({
      scope: "unhandledrejection",
      message: "Unhandled promise rejection",
      error: event.reason,
      severity: Severity.ERROR
    });
  });

  window.__APP_ERROR_REPORTS__ = {
    get: getErrorReports,
    clear: clearErrorReports,
    economy: getEconomySnapshots,
    clearEconomy: clearEconomySnapshots
  };
};
