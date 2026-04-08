import { customClient } from "@/lib/custom-sdk";

// Hard guarantee: ensure entities are available
if (!customClient || !customClient.entities) {
  const isDev = import.meta.env?.DEV || import.meta.env?.MODE === 'development';
  if (isDev) {
    throw new Error(`base44.entities missing: base44Client misconfigured. customClient exists: ${!!customClient}, entities exists: ${!!customClient?.entities}`);
  }
  console.error('[base44Client] CRITICAL: base44.entities missing - this will cause runtime errors');
}

export const base44 = customClient;
