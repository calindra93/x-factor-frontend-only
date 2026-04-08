const queryIssueCache = new Set();
const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

const stringifySafe = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export function logQueryIssue(scope, detail = {}) {
  const cacheKey = `${scope}:${stringifySafe(detail)}`;
  if (queryIssueCache.has(cacheKey)) return;
  queryIssueCache.add(cacheKey);
  console.error(`[query:${scope}]`, detail);
}

export function devLog(scope, detail = {}) {
  if (!isDev) return;
  console.log(`[db:${scope}]`, detail);
}

export function guardId(id, scope = 'unknown') {
  if (id === undefined || id === null || id === '' || String(id) === 'undefined') {
    logQueryIssue(`${scope}.guard`, { reason: 'invalid-id', id });
    return false;
  }
  return true;
}

function hasUndefinedParamValue(value) {
  if (value === undefined) return true;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'undefined') return true;

  if (Array.isArray(value)) {
    return value.some((item) => hasUndefinedParamValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => hasUndefinedParamValue(item));
  }

  return false;
}

export function hasInvalidFilterParams(filter = {}) {
  return Object.values(filter || {}).some((value) => hasUndefinedParamValue(value));
}

export async function runSupabaseQuery({ scope, query, fallback = null }) {
  try {
    const result = await query();
    if (result?.error) {
      logQueryIssue(scope, {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details
      });
    }
    return result;
  } catch (error) {
    logQueryIssue(scope, { message: error?.message || String(error) });
    return fallback;
  }
}

export async function runSafeFetch(url, options = {}, scope = 'fetch') {
  try {
    return await fetch(url, options);
  } catch (error) {
    logQueryIssue(scope, { url, message: error?.message || String(error) });
    throw error;
  }
}
