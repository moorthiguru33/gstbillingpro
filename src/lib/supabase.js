// ============================================================
// Supabase Client — GST Billing SaaS
// Replace VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
// ============================================================
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase env vars. Create .env file from .env.example');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

// ---- Auth Helpers ----

export const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resetPassword = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

/** Current Supabase access token (JWT), refreshed if needed; null if signed out. */
export const getAccessToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
};

/**
 * fetch() for our own /api/* functions, with the signed-in user's
 * access token. The server verifies it with Supabase Auth — never send a
 * bare user id as proof of identity.
 */
export const authFetch = async (url, options = {}) => {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...options, headers });
};

// ---- Subscription Helpers ----

/**
 * Reads the user's subscription row. If none exists (accounts created
 * before the signup trigger), asks the DATABASE to create the trial row
 * (ensure_my_subscription RPC, see supabase/migrations/001). Trial dates
 * therefore always come from the server, never from the browser clock.
 * Throws on network / server errors so the caller can offer a retry.
 */
export const getSubscription = async (userId) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: ensured, error: rpcError } = await supabase.rpc('ensure_my_subscription');
  if (rpcError) throw rpcError;
  return Array.isArray(ensured) ? (ensured[0] || null) : (ensured || null);
};

export const isSubscriptionActive = (sub) => {
  if (!sub) return false;
  const now = new Date();
  if (sub.status === 'active' && sub.current_period_end) {
    return new Date(sub.current_period_end) > now;
  }
  if (sub.status === 'trial' && sub.trial_end) {
    return new Date(sub.trial_end) > now;
  }
  return false;
};

export const getTrialDaysLeft = (sub) => {
  if (!sub || sub.status !== 'trial') return 0;
  const end = new Date(sub.trial_end);
  const now = new Date();
  const diff = end - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};
