// GET /api/admin/me → 200 { admin: true, email } for admins, 403 otherwise.
import { json } from '../../../shared/server.js';
import { adminHandler, adminOptions } from '../../../shared/admin-handler.js';

export const onRequestGet = adminHandler(async ({ adminEmail, cors }) => json({ admin: true, email: adminEmail }, 200, cors));
export const onRequestOptions = adminOptions;
