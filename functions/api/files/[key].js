// ============================================================
// GET /api/files/:key — serves uploaded logos from Cloudflare R2.
// Only the logos/ prefix is served, with headers that stop the browser
// from treating a file as HTML/script.
// ============================================================
const SAFE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function onRequestGet({ params, env }) {
  let key = '';
  try { key = decodeURIComponent(params.key || ''); } catch { return new Response('Bad key', { status: 400 }); }
  if (!/^logos\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?[._][A-Za-z0-9_.-]+$/.test(key) || key.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  const r2 = env.R2_BUCKET || env.BUCKET || env.LOGOS_BUCKET;
  if (!r2) return new Response('Not found', { status: 404 });

  const object = await r2.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const type = headers.get('content-type') || '';
  if (!SAFE_TYPES.has(type)) headers.set('Content-Type', 'application/octet-stream');
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  // Logos are embedded in invoices / PDFs rendered by the app itself.
  headers.set('Cross-Origin-Resource-Policy', 'same-site');
  return new Response(object.body, { headers });
}
