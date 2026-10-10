// Wrapper for the /api/admin/* Pages Functions (kept outside /functions so
// Cloudflare does not turn it into a route).
import { corsHeaders, errorResponse, preflight } from './server.js';
import { requireAdmin } from './admin.js';

export const ADMIN_METHODS = 'GET, POST, OPTIONS';

export function adminHandler(fn) {
  return async (context) => {
    const { request, env } = context;
    const cors = corsHeaders(request, env, ADMIN_METHODS);
    try {
      const admin = await requireAdmin(request, env);
      return await fn({ ...context, ...admin, cors });
    } catch (err) {
      return errorResponse(err, cors);
    }
  };
}

export const adminOptions = ({ request, env }) => preflight(request, env, ADMIN_METHODS);
