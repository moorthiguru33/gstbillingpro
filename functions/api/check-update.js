// GET /api/check-update
// GST Billing Pro is a hosted web app (Cloudflare Pages): every deploy is
// picked up automatically by the service worker, so there is never a
// desktop-style download. Kept for older cached clients that still call it.
export async function onRequestGet() {
  return new Response(JSON.stringify({
    hosted: true,
    updateAvailable: false,
    releaseNotes: 'GST Billing Pro updates automatically — just refresh when prompted.',
    repository: 'https://github.com/moorthiguru33/gstbillingpro',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
