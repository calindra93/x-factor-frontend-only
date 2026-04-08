/**
 * Standardized Edge Function Invoker
 * Handles the unwrapped response from base44.functions.invoke()
 * Provides type-safe wrapper for all edge function calls
 */
import { base44 } from '@/api/base44Client';

export interface EdgeFunctionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  traceId?: string;
  timestamp?: string;
}

/**
 * Invoke an edge function with standardized response handling
 * 
 * @param functionName - Name of the edge function (e.g., 'touring', 'socialMedia')
 * @param payload - Parameters to pass to the function
 * @returns EdgeFunctionResult with success flag and either data or error
 * 
 * @example
 * const result = await invokeEdgeFunction('touring', { 
 *   action: 'generateRoutes', 
 *   artistId: playerId 
 * });
 * 
 * if (result.success) {
 *   const routes = result.data;
 *   // use routes
 * } else {
 *   console.error(`Error (${result.traceId}):`, result.error);
 *   // show user-friendly error message
 * }
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  payload: Record<string, any>
): Promise<EdgeFunctionResult<T>> {
  try {
    // base44.functions.invoke() returns unwrapped data directly (not {data, error})
    const result = await base44.functions.invoke(
      functionName,
      payload
    );
    
    // Check if result is a SafeErrorResponse from edge function
    if (result?.error && result?.traceId) {
      return {
        success: false,
        error: result.error,
        traceId: result.traceId,
        timestamp: result.timestamp
      };
    }
    
    // Check for explicit error field (some functions may return {error: string})
    if (result?.error && typeof result.error === 'string' && !result.data) {
      return {
        success: false,
        error: result.error,
        traceId: result.traceId
      };
    }
    
    // Success case
    return {
      success: true,
      data: result
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Type guard to check if a response is successful
 */
export function isSuccessResult<T>(
  result: EdgeFunctionResult<T>
): result is EdgeFunctionResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResult(result: EdgeFunctionResult): result is EdgeFunctionResult & { error: string } {
  return !result.success && result.error !== undefined;
}
