// ============================================================
// POST /api/upload-logo
// Headers: Authorization: Bearer <Supabase access token>
// Body:    multipart/form-data (field "file" or "logo")
//          or JSON { data: "data:image/png;base64,..." }
//
// Signed-in users only, same-origin only, PNG/JPEG/WebP/GIF only
// (no SVG — it can carry script), max 512 KB, content sniffed from the
// file bytes rather than trusting the declared type.
// ============================================================
import {
  HttpError, json, errorResponse, preflight, corsHeaders, assertOrigin,
  requireEnv, getServiceClient, authenticate,
} from '../../shared/server.js';
import { MAX_LOGO_BYTES, LOGO_TYPES as TYPES, sniffImageType } from '../../shared/images.js';

async function readUpload(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  // base64 inflates by ~4/3; allow a little multipart overhead.
  if (declaredLength > MAX_LOGO_BYTES * 1.4 + 8192) throw new HttpError(413, 'Logo must be 512 KB or smaller.');

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file') || form.get('logo');
    if (!file || typeof file === 'string') throw new HttpError(400, 'No image file found in form data');
    if (file.size > MAX_LOGO_BYTES) throw new HttpError(413, 'Logo must be 512 KB or smaller.');
    return new Uint8Array(await file.arrayBuffer());
  }
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid request body'); }
  const m = typeof body?.data === 'string' && body.data.match(/^data:image\/[a-z.+-]+;base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) throw new HttpError(400, 'Missing or invalid base64 image data');
  if (m[1].length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 4) throw new HttpError(413, 'Logo must be 512 KB or smaller.');
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toBase64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request, env);
  try {
    assertOrigin(request, env);
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const user = await authenticate(request, getServiceClient(env));

    const bytes = await readUpload(request);
    if (bytes.length === 0) throw new HttpError(400, 'Empty file');
    if (bytes.length > MAX_LOGO_BYTES) throw new HttpError(413, 'Logo must be 512 KB or smaller.');
    const mimeType = sniffImageType(bytes);
    if (!mimeType || !TYPES[mimeType]) throw new HttpError(415, 'Only PNG, JPG, WebP or GIF images are allowed.');

    const key = `logos/${user.id}/${Date.now()}.${TYPES[mimeType]}`;
    const r2 = env.R2_BUCKET || env.BUCKET || env.LOGOS_BUCKET;
    if (r2) {
      await r2.put(key, bytes, {
        httpMetadata: { contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable' },
        customMetadata: { userId: user.id },
      });
      const url = env.R2_PUBLIC_DOMAIN
        ? `https://${env.R2_PUBLIC_DOMAIN}/${key}`
        : `/api/files/${encodeURIComponent(key)}`;
      return json({ success: true, url, storage: 'r2' }, 200, cors);
    }

    // No R2 bucket bound: return an inline data URI (stored in the profile).
    return json({
      success: true,
      url: `data:${mimeType};base64,${toBase64(bytes)}`,
      storage: 'inline',
    }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function onRequestOptions({ request, env }) {
  return preflight(request, env, 'POST, OPTIONS');
}
