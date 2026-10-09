// ============================================================
// Cloudflare Pages Function: /api/files/[key]
// Serves images/files stored in Cloudflare R2
// ============================================================

export async function onRequestGet(context) {
  const { params, env } = context;
  const key = decodeURIComponent(params.key || '');

  const r2 = env.R2_BUCKET || env.BUCKET || env.LOGOS_BUCKET;
  if (!r2) {
    return new Response('R2 bucket binding not configured in Cloudflare', { status: 404 });
  }

  const object = await r2.get(key);
  if (!object) {
    return new Response('File not found in R2', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, { headers });
}
