// /api/ai/* — voice and photo billing on Cloudflare Workers AI (binding `AI`).
// Auth required; per-business monthly quota (migration 004 ai_usage).
import {
  HttpError, json, errorResponse, preflight, corsHeaders, assertOrigin, requireEnv,
  getServiceClient, authenticate,
} from './server.js';
import { can } from './staff.js';
import { roleIn, orgTier } from '../functions/api/staff.js';
import {
  MODELS, AI_LANGS, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, aiQuota, aiPeriod, parseModelJson,
  voiceMessages, VOICE_SCHEMA, normalizeVoiceResult, photoPrompt, normalizePhotoResult, cleanText,
} from './ai.js';

const ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Speech → transcript → items. */
export async function runVoice(AI, bytes, lang) {
  const stt = await AI.run(MODELS.stt, { audio: toBase64(bytes), ...(AI_LANGS.includes(lang) ? { language: lang } : {}), vad_filter: true });
  const transcript = cleanText(stt?.text, 4000);
  if (!transcript) return { transcript: '', language: lang || '', customer: { name: '', phone: '' }, items: [] };
  const out = await AI.run(MODELS.llm, {
    messages: voiceMessages(transcript),
    response_format: { type: 'json_schema', json_schema: VOICE_SCHEMA },
    max_tokens: 1500, temperature: 0,
  });
  return { transcript, language: cleanText(stt?.transcription_info?.language || lang, 8), ...normalizeVoiceResult(parseModelJson(out)) };
}

/** Bill photo → structured bill. Llama 3.2 Vision needs a one-time licence "agree". */
export async function runPhoto(AI, bytes, mode, now) {
  const input = { messages: [{ role: 'user', content: photoPrompt(mode) }], image: Array.from(bytes), max_tokens: 2048, temperature: 0 };
  let out;
  try {
    out = await AI.run(MODELS.vision, input);
  } catch (err) {
    if (!/agree/i.test(String(err?.message || err))) throw err;
    await AI.run(MODELS.vision, { prompt: 'agree' });
    out = await AI.run(MODELS.vision, input);
  }
  return normalizePhotoResult(parseModelJson(out), now);
}

export async function handleAi({ request, env, kind, now = new Date(), supabase = null }) {
  if (kind === 'status') return json({ available: Boolean(env.AI) });
  supabase = supabase || getServiceClient(env);
  const user = await authenticate(request, supabase);
  const url = new URL(request.url);
  const ownerParam = url.searchParams.get('owner');
  const ownerId = ownerParam && UUID_RE.test(ownerParam) ? ownerParam : user.id;
  const role = await roleIn(supabase, ownerId, user.id);
  if (!role || !can(role, 'write')) throw new HttpError(403, 'Your role cannot use AI billing.', 'ai_forbidden');
  const tier = await orgTier(supabase, ownerId, now);
  const limit = aiQuota(tier);
  const period = aiPeriod(now);

  if (kind === 'usage') {
    const { data, error } = await supabase.from('ai_usage').select('total').eq('owner_id', ownerId).eq('period', period).maybeSingle();
    if (error) throw error;
    return json({ used: data?.total || 0, limit, tier, available: Boolean(env.AI) });
  }
  if (!env.AI) throw new HttpError(503, 'AI billing is not enabled on this server yet.', 'ai_unavailable');

  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const isVoice = kind === 'voice';
  if (isVoice ? !/^(audio|video)\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|m4a)$/.test(type) : !/^image\/(jpeg|png|webp)$/.test(type)) {
    throw new HttpError(415, 'Unsupported file type.', 'ai_bad_type');
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 100) throw new HttpError(400, 'The file is empty.', 'ai_empty');
  if (bytes.length > (isVoice ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES)) throw new HttpError(413, 'The file is too large.', 'ai_too_large');

  const { data: used, error } = await supabase.rpc('ai_consume', { p_owner: ownerId, p_kind: kind, p_limit: limit, p_period: period });
  if (error) throw error;
  if (typeof used !== 'number' || used < 0) throw new HttpError(402, 'Monthly AI limit reached.', 'ai_limit');

  let result;
  try {
    result = isVoice
      ? await runVoice(env.AI, bytes, url.searchParams.get('lang'))
      : await runPhoto(env.AI, bytes, url.searchParams.get('mode') === 'sales' ? 'sales' : 'purchase', now);
  } catch (err) {
    console.error('[ai] model call failed', err?.message || err);
    await supabase.rpc('ai_refund', { p_owner: ownerId, p_kind: kind, p_period: period }).then(() => {}, () => {});
    throw new HttpError(502, 'AI could not read this. Please try again.', 'ai_failed');
  }
  return json({ ...result, usage: { used, limit } });
}

/** Pages Functions route factory. */
export const aiRoute = (kind, methods) => {
  const handler = async ({ request, env }) => {
    const cors = corsHeaders(request, env, methods);
    try {
      if (kind !== 'status') { assertOrigin(request, env); requireEnv(env, ENV); }
      const res = await handleAi({ request, env, kind });
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      return errorResponse(err, cors);
    }
  };
  return { handler, options: ({ request, env }) => preflight(request, env, methods) };
};
