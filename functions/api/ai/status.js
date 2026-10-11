import { aiRoute } from '../../../shared/ai-handler.js';

const r = aiRoute('status', 'GET, OPTIONS');
export const onRequestGet = r.handler;
export const onRequestOptions = r.options;
