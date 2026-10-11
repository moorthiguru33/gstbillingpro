// AI billing: parsers/normalisers + handler with a fake Workers AI binding.
// No live AI calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseModelJson, normalizeVoiceResult, normalizePhotoResult, toNum, normDate, normGstin, normGstRate,
  normPhone, normUnit, cleanText, similarity, matchProduct, aiQuota, aiPeriod, MODELS,
} from '../shared/ai.js';
import { handleAi } from '../shared/ai-handler.js';
import { aiPhotoToParsed } from '../src/utils/ocrParse.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/ai/${n}.json`, import.meta.url), 'utf8'));
const NOW = new Date('2026-10-11T06:00:00Z');
let n = 0;
const test = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

await test('number / field normalisers', () => {
  assert.equal(toNum('₹1,200.50'), 1200.5);
  assert.equal(toNum('१२'), 12);
  assert.equal(toNum('௩'), 3);
  assert.equal(toNum('12 kg'), null);
  assert.equal(toNum(-5), null);
  assert.equal(toNum(Infinity), null);
  assert.equal(toNum('9'.repeat(20)), null);
  assert.equal(normDate('05/10/2026', NOW), '2026-10-05');
  assert.equal(normDate('5-10-26', NOW), '2026-10-05');
  assert.equal(normDate('2026-10-05', NOW), '2026-10-05');
  assert.equal(normDate('5 Oct 2026', NOW), '2026-10-05');
  assert.equal(normDate('31/02/2026', NOW), '');
  assert.equal(normDate('01/01/1999', NOW), '');
  assert.equal(normDate('tomorrow', NOW), '');
  assert.equal(normGstin('33abcde1234f1z5'), '33ABCDE1234F1Z5');
  assert.equal(normGstin('33ABCDE1234F1Y5'), '');
  assert.equal(normGstRate('12%'), 12);
  assert.equal(normGstRate(17), null);
  assert.equal(normPhone('+91 98765 43210'), '9876543210');
  assert.equal(normPhone('12345'), '');
  assert.equal(normUnit('Kilo'), 'kg');
  assert.equal(normUnit('furlongs'), '');
  assert.equal(cleanText('<img src=x onerror=alert(1)>\u0000hi', 200).includes('<'), false);
  assert.equal(cleanText('x'.repeat(500), 10).length, 10);
});

await test('JSON extraction from chatty model replies', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Here: {"a":"}{"} trailing {"b":2}'), { a: '}{' });
  assert.deepEqual(parseModelJson({ response: { a: 2 } }), { a: 2 });
  assert.deepEqual(parseModelJson({ response: 'x {"a":3}' }), { a: 3 });
  assert.equal(parseModelJson('no json here'), null);
  assert.equal(parseModelJson('{"a":'), null);
  assert.equal(parseModelJson(42), null);
});

await test('voice fixture → clean items', () => {
  const r = normalizeVoiceResult(parseModelJson(fx('voice-llm').llm));
  assert.deepEqual(r.customer, { name: 'Ravi Anna', phone: '9876543210' });
  assert.equal(r.items.length, 4);
  assert.deepEqual(r.items[0], { name: 'சர்க்கரை', qty: 2, unit: 'kg', rate: 45 });
  assert.deepEqual(r.items[1], { name: 'Soap', qty: 3, unit: 'pcs', rate: 0 });
  assert.deepEqual(r.items[2], { name: 'Eggs', qty: 1, unit: 'dozen', rate: 72 });
  assert.equal(r.items[3].qty, 1); // negative qty rejected → 1
  assert.equal(r.items[3].rate, 0);
  assert.ok(!r.items[3].name.includes('<'));
  assert.deepEqual(normalizeVoiceResult(null), { customer: { name: '', phone: '' }, items: [] });
  assert.equal(normalizeVoiceResult({ items: Array.from({ length: 500 }, () => ({ name: 'x' })) }).items.length, 100);
});

await test('purchase photo fixture → validated bill', () => {
  const r = normalizePhotoResult(parseModelJson(fx('photo-purchase')), NOW);
  assert.equal(r.supplier, 'Sri Murugan Paper Mart');
  assert.equal(r.gstin, '33ABCDE1234F1Z5');
  assert.equal(r.invoiceNo, 'SMP/2026-27/0412');
  assert.equal(r.date, '2026-10-05');
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items[0], { name: 'A4 Paper 75 GSM', hsn: '4802', qty: 10, unit: 'ream', rate: 240, gst: 12, amount: 2400 });
  assert.equal(r.items[1].gst, null); // 17% is not a GST slab
  assert.equal(r.items[1].qty, 1);
  assert.equal(r.items[1].rate, 1500); // derived from amount
  assert.deepEqual(r.totals, { taxable: 3900, cgst: 144, sgst: 144, igst: 0, total: 4188 });
  const parsed = aiPhotoToParsed(r, [{ id: 'p1', name: 'Toner cartridge', hsn: '8443', taxPercent: 18 }]);
  assert.equal(parsed.supplierGstin, '33ABCDE1234F1Z5');
  assert.equal(parsed.grandTotal, 4188);
  assert.equal(parsed.items[1].taxPercent, 18); // from catalogue when AI gst invalid
  assert.equal(parsed.items[1]._matchedProductId, 'p1');
  assert.equal(parsed.items[0].quantity, 10);
});

await test('handwritten photo fixture → sales items, bad fields dropped', () => {
  const r = normalizePhotoResult(parseModelJson(fx('photo-handwritten')), NOW);
  assert.equal(r.gstin, '');
  assert.equal(r.date, '');
  assert.ok(!/[<>]/.test(r.invoiceNo) && r.invoiceNo.includes('42'));
  assert.equal(r.customer, 'Kumar');
  assert.deepEqual(r.items.map(i => [i.qty, i.rate, i.amount]), [[500, 1.5, 750], [2, 450, 900]]);
  assert.equal(r.totals.total, 1650);
});

await test('fuzzy catalogue matching', () => {
  const cat = [{ id: 1, name: 'Sugar 1kg' }, { id: 2, name: 'Lifebuoy Soap' }, { id: 3, name: 'சர்க்கரை' }, { id: 4, name: 'Eggs (tray)' }];
  assert.equal(matchProduct('sugar', cat).product.id, 1);
  assert.equal(matchProduct('soap', cat).product.id, 2);
  assert.equal(matchProduct('சர்க்கரை', cat).product.id, 3);
  assert.equal(matchProduct('egg', cat).product.id, 4);
  assert.equal(matchProduct('cement', cat), null);
  assert.ok(similarity('Visiting card', 'visiting cards') > 0.8);
});

await test('quota table and period (IST)', () => {
  assert.deepEqual([aiQuota('free'), aiQuota('starter'), aiQuota('pro'), aiQuota('business'), aiQuota('nope')], [10, 50, 200, 1000, 10]);
  assert.equal(aiPeriod(new Date('2026-10-31T19:00:00Z')), '2026-11'); // 00:30 IST on 1 Nov
  assert.equal(aiPeriod(new Date('2026-10-31T18:00:00Z')), '2026-10');
});

// ---- handler with fake Supabase + fake AI binding ----
function fakeSupabase({ used = 0, limitHit = false } = {}) {
  const calls = [];
  const chain = (table) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'subscriptions' ? { status: 'active', tier: 'pro', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } : { total: used }, error: null }) };
    return q;
  };
  return {
    calls,
    auth: { getUser: async (tok) => (tok === 'a.good.b' ? { data: { user: { id: 'u1', email: 'a@b.co' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    from: chain,
    rpc: async (name, args) => { calls.push([name, args]); return name === 'ai_consume' ? { data: limitHit ? -1 : used + 1, error: null } : { data: null, error: null }; },
  };
}
function fakeAI({ fail = false, needAgree = false } = {}) {
  const runs = [];
  let agreed = !needAgree;
  return {
    runs,
    run: async (model, input) => {
      runs.push(model);
      if (fail) throw new Error('model down');
      if (model === MODELS.stt) return fx('voice-llm').stt;
      if (model === MODELS.llm) { assert.ok(input.messages[1].content.includes('சர்க்கரை')); return fx('voice-llm').llm; }
      if (model === MODELS.vision) {
        if (input.prompt === 'agree') { agreed = true; return { response: 'ok' }; }
        if (!agreed) throw new Error('5016: Prior to using this model, you must submit the prompt \'agree\'');
        assert.ok(Array.isArray(input.image));
        return fx('photo-purchase');
      }
      throw new Error('unknown model');
    },
  };
}
const audio = new Uint8Array(2000).fill(7);
const mk = (path, { token = 'a.good.b', type = 'audio/webm', body = audio } = {}) => new Request(`https://gst-billing-pro.pages.dev/api/ai/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body });

await test('voice endpoint end to end (fake AI)', async () => {
  const sb = fakeSupabase({ used: 3 });
  const res = await handleAi({ request: mk('voice-bill?lang=ta'), env: { AI: fakeAI() }, kind: 'voice', now: NOW, supabase: sb });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items.length, 4);
  assert.equal(body.customer.phone, '9876543210');
  assert.equal(body.language, 'ta');
  assert.deepEqual(body.usage, { used: 4, limit: 200 });
  assert.deepEqual(sb.calls[0], ['ai_consume', { p_owner: 'u1', p_kind: 'voice', p_limit: 200, p_period: '2026-10' }]);
});

await test('photo endpoint handles licence agree', async () => {
  const ai = fakeAI({ needAgree: true });
  const res = await handleAi({ request: mk('photo-bill', { type: 'image/jpeg' }), env: { AI: ai }, kind: 'photo', now: NOW, supabase: fakeSupabase() });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).gstin, '33ABCDE1234F1Z5');
  assert.equal(ai.runs.length, 3);
});

await test('errors: auth, type, size, quota, model failure refund, no binding', async () => {
  const code = async (p) => { try { await p; return 'ok'; } catch (e) { return `${e.status}:${e.code || ''}`; } };
  assert.match(await code(handleAi({ request: mk('voice-bill', { token: 'bad' }), env: { AI: fakeAI() }, kind: 'voice', supabase: fakeSupabase() })), /^401/);
  assert.equal(await code(handleAi({ request: mk('voice-bill', { type: 'text/html' }), env: { AI: fakeAI() }, kind: 'voice', supabase: fakeSupabase() })), '415:ai_bad_type');
  assert.equal(await code(handleAi({ request: mk('photo-bill', { type: 'image/svg+xml' }), env: { AI: fakeAI() }, kind: 'photo', supabase: fakeSupabase() })), '415:ai_bad_type');
  assert.equal(await code(handleAi({ request: mk('voice-bill', { body: new Uint8Array(10) }), env: { AI: fakeAI() }, kind: 'voice', supabase: fakeSupabase() })), '400:ai_empty');
  assert.equal(await code(handleAi({ request: mk('photo-bill', { type: 'image/png', body: new Uint8Array(6 * 1024 * 1024) }), env: { AI: fakeAI() }, kind: 'photo', supabase: fakeSupabase() })), '413:ai_too_large');
  assert.equal(await code(handleAi({ request: mk('voice-bill'), env: { AI: fakeAI() }, kind: 'voice', supabase: fakeSupabase({ limitHit: true }) })), '402:ai_limit');
  assert.equal(await code(handleAi({ request: mk('voice-bill'), env: {}, kind: 'voice', supabase: fakeSupabase() })), '503:ai_unavailable');
  const sb = fakeSupabase();
  assert.equal(await code(handleAi({ request: mk('voice-bill'), env: { AI: fakeAI({ fail: true }) }, kind: 'voice', supabase: sb })), '502:ai_failed');
  assert.deepEqual(sb.calls.map(c => c[0]), ['ai_consume', 'ai_refund']);
  const st = await handleAi({ request: new Request('https://x/api/ai/status'), env: { AI: {} }, kind: 'status' });
  assert.deepEqual(await st.json(), { available: true });
});

console.log(`ai-test: ${n} groups passed`);
