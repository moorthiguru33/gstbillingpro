// ============================================================
// POST /api/cron/daily   (also GET)   Authorization: Bearer <CRON_SECRET>
// Called once a day by .github/workflows/daily-cron.yml (Cloudflare Pages
// has no cron of its own). Runs shared/lifecycle.js.
// ============================================================
import { json, requireEnv, getServiceClient, getBearerToken, timingSafeEqual } from '../../../shared/server.js';
import { runDailyLifecycle } from '../../../shared/lifecycle.js';
import { emailConfigured } from '../../../shared/email.js';

async function handle({ request, env }) {
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 16) {
    console.error('[cron] CRON_SECRET missing or shorter than 16 characters');
    return json({ error: 'not configured' }, 503);
  }
  const token = getBearerToken(request) || '';
  if (!timingSafeEqual(token, env.CRON_SECRET)) return json({ error: 'unauthorized' }, 401);
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  } catch {
    return json({ error: 'not configured' }, 500);
  }
  try {
    const stats = await runDailyLifecycle(env, getServiceClient(env));
    return json({ ok: true, emailConfigured: emailConfigured(env), ...stats });
  } catch (err) {
    console.error('[cron] failed:', err && (err.message || err));
    return json({ error: 'cron failed' }, 500);
  }
}

export const onRequestPost = handle;
export const onRequestGet = handle;
