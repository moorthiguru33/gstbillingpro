// ============================================================
// Shared helpers for Cloudflare Pages Functions (server-only).
// Lives OUTSIDE /functions so Pages does not turn it into a route;
// the functions import it relatively and esbuild bundles it.
// ============================================================
import { createClient } from '@supabase/supabase-js';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code; // machine-readable reason for the client (i18n)
  }
}

const DEFAULT_ORIGINS = [
  'https://gst-billing-pro.pages.dev',
  'https://gstbillingpro.com',
  'https://www.gstbillingpro.com',
];

/** Origins allowed to call the API from a browser. */
export function allowedOrigins(env = {}) {
  const list = String(env.ALLOWED_ORIGINS || env.APP_ORIGIN || '')
    .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (env.VITE_APP_URL) list.push(String(env.VITE_APP_URL).replace(/\/+$/, ''));
  return list.length ? list : DEFAULT_ORIGINS;
}

export function isOriginAllowed(origin, env = {}) {
  if (!origin) return true; // same-origin navigation / server-to-server
  const allowed = allowedOrigins(env);
  if (allowed.includes(origin)) return true;
  // Cloudflare Pages preview deployments of the same project:
  // https://<hash>.gst-billing-pro.pages.dev (and branch aliases)
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') {
      return env.ALLOW_LOCALHOST === '1' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    }
    return allowed.some(a => {
      const host = new URL(a).hostname;
      return host.endsWith('.pages.dev') && u.hostname.endsWith(`.${host}`);
    });
  } catch {
    return false;
  }
}

export function corsHeaders(request, env, methods = 'POST, OPTIONS') {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && isOriginAllowed(origin, env)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

/** Turn any thrown error into a JSON response without leaking internals. */
export function errorResponse(err, headers = {}) {
  if (err instanceof HttpError) return json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status, headers);
  console.error('[api] unexpected error:', err && (err.stack || err.message || err));
  return json({ error: 'Something went wrong. Please try again or contact support.' }, 500, headers);
}

export function preflight(request, env, methods) {
  const origin = request.headers.get('Origin');
  if (origin && !isOriginAllowed(origin, env)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(request, env, methods) });
}

/** Rejects browser calls from foreign origins (CSRF / abuse guard). */
export function assertOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && !isOriginAllowed(origin, env)) throw new HttpError(403, 'Origin not allowed');
}

export function requireEnv(env, names) {
  const missing = names.filter(n => !env[n]);
  if (missing.length) {
    console.error('[api] missing environment variables:', missing.join(', '));
    throw new HttpError(500, 'This service is not configured yet. Please contact support.');
  }
}

export function getServiceClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getBearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

/**
 * Authenticates the caller from `Authorization: Bearer <supabase access token>`.
 * The token is verified by Supabase Auth (signature + expiry + not revoked).
 */
export async function authenticate(request, supabase) {
  const token = getBearerToken(request);
  // A Supabase access token is a JWT (three dot-separated parts). The old
  // client sent the raw user id here, which proved nothing.
  if (!token || token.split('.').length !== 3) throw new HttpError(401, 'Please sign in again.');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return data.user;
}

const enc = new TextEncoder();

export async function hmacSha256Hex(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison. */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function razorpay(env, path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const reason = data?.error?.description || `HTTP ${res.status}`;
    console.error(`[razorpay] ${method} ${path} failed: ${reason}`);
    throw new HttpError(502, 'Payment gateway error. Please try again in a minute.');
  }
  return data;
}
