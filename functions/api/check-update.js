// functions/api/check-update.js
// Cloudflare Pages Function: Returns status for version updates

export async function onRequestGet(context) {
  return new Response(JSON.stringify({
    currentVersion: '1.10.82',
    latest: '1.10.82',
    updateAvailable: false,
    releaseNotes: 'You are running the latest version of GST Billing Pro.',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
