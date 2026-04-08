/**
 * Custom SDK Shim - Browser Safe Entry Point
 * 
 * This file ONLY re-exports from the browser-safe SDK.
 * Any imports of "@/lib/custom-sdk" will automatically get the browser version.
 * 
 * DO NOT import server-only modules here - they will be bundled into the browser!
 */

// Re-export everything from browser SDK
export * from "./custom-sdk-browser";
