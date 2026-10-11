import { aiRoute } from '../../../shared/ai-handler.js';

const r = aiRoute('usage', 'GET, OPTIONS');
export const onRequestGet = r.handler;
export const onRequestOptions = r.options;
