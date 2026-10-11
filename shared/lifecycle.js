// ============================================================
// Daily subscription lifecycle (server-only), run by /api/cron/daily.
//   - trial ending reminders  : 7 / 3 / 1 days left (day 23 / 27 / 29)
//   - renewal due reminders   : 7 / 1 days before a paid period ends
//   - lapsed trials / plans   : status → 'free' + "you are on Free" e-mail
//   - lifetime owners whose upgrade lapsed go back to lifetime Starter
// Every e-mail has a dedupe key, so re-running the job is harmless.
// ============================================================
import { LIFETIME_PERIOD_END, DAY } from './plans.js';
import { sendLoggedEmail } from './email.js';
import { trialEndingEmail, renewalDueEmail, expiredEmail } from './email-templates.js';
import { appUrlOf } from './notify.js';

export const TRIAL_REMINDER_DAYS = [7, 3, 1];
export const RENEWAL_REMINDER_DAYS = [7, 1];
const PAGE = 1000;
const MAX_ROWS = 50000;

/** Smallest reminder threshold that `daysLeft` has reached (or null). */
export function reminderBucket(daysLeft, thresholds) {
  const hit = [...thresholds].sort((a, b) => a - b).find(t => daysLeft <= t);
  return daysLeft > 0 && hit != null ? hit : null;
}

export async function fetchAll(query, page = PAGE) {
  const out = [];
  for (let from = 0; from < MAX_ROWS; from += page) {
    const { data, error } = await query().range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function runDailyLifecycle(env, supabase, { now = new Date(), maxEmails = 300 } = {}) {
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 8 * DAY).toISOString();
  const appUrl = appUrlOf(env);
  const stats = { trialReminders: 0, renewalReminders: 0, movedToFree: 0, lifetimeRestored: 0, expiredEmails: 0, emailStatus: {} };
  let budget = maxEmails;
  const send = async (sub, kind, dedupeKey, tpl) => {
    if (budget <= 0 || !sub.email) return;
    budget--;
    const r = await sendLoggedEmail(env, supabase, { userId: sub.user_id, kind, dedupeKey, to: sub.email, ...tpl });
    stats.emailStatus[r.status] = (stats.emailStatus[r.status] || 0) + 1;
    return r;
  };
  const daysLeft = (iso) => Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY);

  // 1. Trials ending soon
  const trials = await fetchAll(() => supabase.from('subscriptions')
    .select('user_id,email,status,trial_end').eq('status', 'trial').gt('trial_end', nowIso).lte('trial_end', soonIso).order('user_id'));
  for (const s of trials) {
    const d = daysLeft(s.trial_end);
    const bucket = reminderBucket(d, TRIAL_REMINDER_DAYS);
    if (bucket == null) continue;
    await send(s, 'trial_ending', `trial_ending:${s.user_id}:${bucket}`, trialEndingEmail({ appUrl, daysLeft: d, trialEnd: s.trial_end }));
    stats.trialReminders++;
  }

  // 2. Paid periods ending soon (not lifetime)
  const renewals = await fetchAll(() => supabase.from('subscriptions')
    .select('user_id,email,status,plan,tier,lifetime,current_period_end').eq('status', 'active')
    .gt('current_period_end', nowIso).lte('current_period_end', soonIso).order('user_id'));
  for (const s of renewals) {
    const d = daysLeft(s.current_period_end);
    const bucket = reminderBucket(d, RENEWAL_REMINDER_DAYS);
    if (bucket == null) continue;
    await send(s, 'renewal_due', `renewal_due:${s.user_id}:${s.current_period_end.slice(0, 10)}:${bucket}`,
      renewalDueEmail({ appUrl, daysLeft: d, periodEnd: s.current_period_end, planId: s.plan }));
    stats.renewalReminders++;
  }

  // 3a. Lapsed trials → Free
  const lapsedTrials = await fetchAll(() => supabase.from('subscriptions')
    .select('user_id,email,trial_end,lifetime').eq('status', 'trial').lte('trial_end', nowIso).order('user_id'));
  for (const s of lapsedTrials) {
    const { data: moved, error } = await supabase.from('subscriptions')
      .update({ status: 'free', tier: 'free', updated_at: nowIso })
      .eq('user_id', s.user_id).eq('status', 'trial').lte('trial_end', nowIso).select('user_id');
    if (error) { console.error('[cron] trial → free failed:', error.message); continue; }
    if (!moved?.length) continue;
    stats.movedToFree++;
    await send(s, 'expired', `expired:${s.user_id}:trial`, expiredEmail({ appUrl, wasTrial: true }));
    stats.expiredEmails++;
  }

  // 3b. Lapsed paid plans
  const lapsedPaid = await fetchAll(() => supabase.from('subscriptions')
    .select('user_id,email,lifetime,current_period_end,tier').eq('status', 'active').lte('current_period_end', nowIso).order('user_id'));
  for (const s of lapsedPaid) {
    if (s.lifetime) {
      // An upgrade on top of lifetime ran out → back to lifetime Starter.
      const { error } = await supabase.from('subscriptions')
        .update({ tier: 'starter', current_period_end: LIFETIME_PERIOD_END, updated_at: nowIso })
        .eq('user_id', s.user_id).eq('status', 'active').lte('current_period_end', nowIso);
      if (error) console.error('[cron] lifetime restore failed:', error.message); else stats.lifetimeRestored++;
      continue;
    }
    const { data: moved, error } = await supabase.from('subscriptions')
      .update({ status: 'free', tier: 'free', updated_at: nowIso })
      .eq('user_id', s.user_id).eq('status', 'active').lte('current_period_end', nowIso).select('user_id');
    if (error) { console.error('[cron] paid → free failed:', error.message); continue; }
    if (!moved?.length) continue;
    stats.movedToFree++;
    await send(s, 'expired', `expired:${s.user_id}:${String(s.current_period_end).slice(0, 10)}`, expiredEmail({ appUrl, wasTrial: false }));
    stats.expiredEmails++;
  }

  stats.emailBudgetLeft = budget;
  return stats;
}
