import { aiRoute } from '../../../shared/ai-handler.js';

const r = aiRoute('photo', 'POST, OPTIONS');
export const onRequestPost = r.handler;
export const onRequestOptions = r.options;
