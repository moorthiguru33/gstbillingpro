// GET /b/<token> — public, unguessable bill page: view / download the PDF
// (short-lived signed URL from the private "invoices" bucket) and pay by UPI.
import { getServiceClient } from '../../shared/server.js';
import { BILL_TOKEN_RE, SIGNED_URL_SECONDS, renderBillPage, BILL_PAGE_HEADERS } from '../../shared/bill-link.js';

export async function loadBillLink(supabase, token, now = new Date()) {
  if (!BILL_TOKEN_RE.test(token || '')) return null;
  const { data, error } = await supabase.from('bill_links').select('*').eq('token', token).maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= now.getTime()) return null;
  return data;
}

export async function onRequestGet({ params, env, waitUntil }) {
  const token = String(params?.token || '');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(renderBillPage(null), { status: 503, headers: BILL_PAGE_HEADERS });
  }
  try {
    const supabase = getServiceClient(env);
    const link = await loadBillLink(supabase, token);
    if (!link) return new Response(renderBillPage(null), { status: 404, headers: BILL_PAGE_HEADERS });
    const bucket = supabase.storage.from('invoices');
    const fname = `${String(link.invoice_number || 'bill').replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf`;
    const [view, dl] = await Promise.all([
      bucket.createSignedUrl(link.pdf_path, SIGNED_URL_SECONDS),
      bucket.createSignedUrl(link.pdf_path, SIGNED_URL_SECONDS, { download: fname }),
    ]);
    const p = supabase.from('bill_links').update({ views: (link.views || 0) + 1 }).eq('token', token).then(() => {}, () => {});
    if (typeof waitUntil === 'function') waitUntil(p);
    return new Response(renderBillPage(link, { viewUrl: view?.data?.signedUrl, downloadUrl: dl?.data?.signedUrl }), { status: 200, headers: BILL_PAGE_HEADERS });
  } catch (e) {
    console.error('[bill-page]', e?.message);
    return new Response(renderBillPage(null), { status: 500, headers: BILL_PAGE_HEADERS });
  }
}
