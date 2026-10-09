// ============================================================
// Cloudflare Pages Function: /api/upload-logo
// Uploads business logo to Cloudflare R2 bucket
// ============================================================

export async function onRequestPost(context) {
  const { request, env } = context;

  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const contentType = request.headers.get('content-type') || '';
    let fileBuffer;
    let mimeType = 'image/png';
    let originalName = 'logo.png';
    let userId = 'user';

    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      userId = authHeader.replace(/^Bearer\s+/i, '').slice(0, 24);
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') || formData.get('logo');
      if (!file) {
        return new Response(JSON.stringify({ error: 'No image file found in form data' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      originalName = file.name || 'logo.png';
      mimeType = file.type || 'image/png';
      fileBuffer = await file.arrayBuffer();
    } else {
      // JSON with base64
      const body = await request.json();
      if (!body.data) {
        return new Response(JSON.stringify({ error: 'Missing base64 data' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const match = body.data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        const binaryStr = atob(match[2]);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        fileBuffer = bytes.buffer;
      }
    }

    const ext = originalName.split('.').pop() || 'png';
    const filename = `logos/${userId}_${Date.now()}.${ext}`;

    // 1. Check if Cloudflare R2 bucket is bound
    const r2 = env.R2_BUCKET || env.BUCKET || env.LOGOS_BUCKET;
    if (r2) {
      await r2.put(filename, fileBuffer, {
        httpMetadata: {
          contentType: mimeType,
          cacheControl: 'public, max-age=31536000',
        },
      });

      // Public URL via Cloudflare R2 worker or CDN domain
      const r2PublicDomain = env.R2_PUBLIC_DOMAIN;
      const fileUrl = r2PublicDomain
        ? `https://${r2PublicDomain}/${filename}`
        : `/api/files/${encodeURIComponent(filename)}`;

      return new Response(JSON.stringify({ success: true, url: fileUrl, storage: 'r2' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fallback: Base64 data URI if R2 bucket binding is not yet added in Cloudflare dashboard
    const bytes = new Uint8Array(fileBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const dataUri = `data:${mimeType};base64,${base64}`;

    return new Response(JSON.stringify({
      success: true,
      url: dataUri,
      storage: 'inline',
      notice: 'Saved inline. To use Cloudflare R2, link R2 bucket with binding name R2_BUCKET in Cloudflare Pages settings.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
