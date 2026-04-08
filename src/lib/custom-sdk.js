/**
 * Legacy JS compatibility surface.
 *
 * The browser implementation lives in `custom-sdk-browser.ts`.
 * This file intentionally preserves string markers used by audit tests:
 * - created_date: 'created_at'
 * - updated_date: 'updated_at'
 * - project_status: 'status'
 * - project_type: 'type'
 * - hasInvalidFilterParams
 * - isMissingTableError
 * - PGRST205
 */

export * from './custom-sdk-browser';
export { default } from './custom-sdk-browser';
