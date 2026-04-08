/**
 * Safe Error Response Handler for Edge Functions
 * Prevents stack trace leakage to clients while logging full errors server-side
 */

export interface SafeErrorResponse {
  error: string;
  details?: string;
  traceId: string;
  timestamp: string;
}

/**
 * Generate a simple trace ID (UUID v4-like format)
 */
function generateTraceId(): string {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      id += '-';
    } else if (i === 14) {
      id += '4'; // UUID v4 version
    } else if (i === 19) {
      id += chars[(Math.random() * 4 | 8)]; // UUID v4 variant
    } else {
      id += chars[Math.random() * 16 | 0];
    }
  }
  return id;
}

/**
 * Create a safe error response for client consumption
 * Full error is logged server-side with traceId for debugging
 */
export function createSafeErrorResponse(
  error: unknown,
  context: string = 'unknown'
): SafeErrorResponse {
  const traceId = generateTraceId();
  const timestamp = new Date().toISOString();
  
  // Log full error server-side with context
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : '';
  console.error(`[${context}] TraceId: ${traceId}`, {
    message: errorMessage,
    stack: errorStack,
    timestamp
  });
  
  // Return safe error to client (truncated message, no stack)
  const safeMessage = errorMessage.length > 200 
    ? errorMessage.substring(0, 200) + '...' 
    : errorMessage;
  
  return {
    error: safeMessage,
    traceId,
    timestamp
  };
}

/**
 * Wrap an async function with error handling
 * Returns SafeErrorResponse on error, original result on success
 */
export async function wrapEdgeFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string
): Promise<(...args: Parameters<T>) => Promise<any>> {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      return createSafeErrorResponse(error, context);
    }
  };
}

/**
 * Check if a response is a SafeErrorResponse
 */
export function isSafeErrorResponse(response: any): response is SafeErrorResponse {
  return (
    response &&
    typeof response === 'object' &&
    'error' in response &&
    'traceId' in response &&
    'timestamp' in response
  );
}
