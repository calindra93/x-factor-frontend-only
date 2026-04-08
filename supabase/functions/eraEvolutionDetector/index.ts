import { handleEraRequest } from '../_shared/eraEvolutionDetector.ts';

// @ts-ignore - Deno global is available in Supabase Edge Functions
Deno.serve((req: Request) => handleEraRequest(req));
