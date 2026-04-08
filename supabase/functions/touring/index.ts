
import { handleRequest } from '../_shared/touringRouter.ts';

Deno.serve(async (req: Request) => {
  return handleRequest(req);
});
