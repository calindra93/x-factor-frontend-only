// Minimal Base44 type shim to unblock TypeScript

declare module "@/lib/custom-sdk-browser" {
  export const customClient: any;
  const _default: any;
  export default _default;
}

declare module "@/lib/custom-sdk" {
  export const customClient: any;
  const _default: any;
  export default _default;
}

declare module "@/lib/custom-sdk.js" {
  export const customClient: any;
  const _default: any;
  export default _default;
}

declare module "@/api/base44Client" {
  const base44: any;
  export { base44 };
}

declare module "@/api/base44Client.js" {
  const base44: any;
  export { base44 };
}

// Global declaration for direct base44 usage
declare const base44: any;

declare global {
  interface Window {
    base44?: any;
  }
}

export {};
