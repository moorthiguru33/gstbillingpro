import { useCallback, useEffect, useState } from 'react';
import { getSession, getAccessToken } from '../../lib/supabase';
import { PURCHASABLE_PLAN_IDS, TIERS, formatPlanPrice } from '../../../shared/plans.js';

// ============================================================
// /admin — owner console. Every number and action comes from
// /api/admin/* Pages Functions, which check the caller's verified e-mail
// against public.admins with the service role. Nothing here is trusted:
// a non-admin who opens this page just gets "Not allowed".
// English only (internal tool).
// ============================================================

const rupees = (paise) => formatPlanPrice(Number(paise) || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—');

async function api(path, opts = {}) {
  const token = await getAccessToken();
  const res = await fetch(`/api/admin/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1rem' };
const inp = { padding: '0.5rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', minWidth: 0 };
const btn = { padding: '0.5rem 0.9rem', borderRadius: 8, border: '1px solid #1d4ed8', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' };
const btn2 = { ...btn, background: '#fff', color: '#1d4ed8' };

function Stat({ label, value }) {
  return <div style={card}><div style={{ fontSize: '0.75rem', color: '#64748b' }}>{label}</div><div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{value}</div></div>;
}

function Table({ cols, rows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead><tr>{cols.map(c => <th key={c[0]} style={{ textAlign: 'left', padding: '0.4rem', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c[0]}</th>)}</tr></thead>
        <tbody>{rows.length === 0
          ? <tr><td colSpan={cols.length} style={{ padding: '0.6rem', color: '#94a3b8' }}>Nothing yet</td></tr>
          : rows.map((r, i) => <tr key={i}>{cols.map(c => <td key={c[0]} style={{ padding: '0.4rem', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{c[1](r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Overview() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('stats').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <p style={{ color: '#dc2626' }}>{err}</p>;
  if (!d) return <p>Loading…</p>;
  const s = d.stats;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.7rem' }}>
        <Stat label="Total users" value={s.totalUsers} />
        <Stat label="On trial" value={s.trial} />
        <Stat label="Free" value={s.free} />
        <Stat label="Paid" value={s.paid} />
        <Stat label="Lifetime" value={s.lifetime} />
        <Stat label="MRR" value={rupees(s.mrr)} />
        <Stat label="ARR" value={rupees(s.arr)} />
        <Stat label="Revenue this month" value={`${rupees(s.revenueThisMonth)} (${s.paymentsThisMonth})`} />
        <Stat label="Paid expiring ≤7d" value={s.expiringIn7Days} />
        <Stat label="Trials ending ≤7d" value={s.trialsEndingIn7Days} />
        <Stat label="Founder seats" value={`${d.founder.sold}/${d.founder.cap}`} />
      </div>
      <div style={card}>
        <strong>Paid by tier</strong>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 6, fontSize: '0.88rem' }}>
          {Object.entries(s.paidByTier).map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 6, fontSize: '0.8rem', color: '#475569' }}>
          {Object.entries(s.paidByPlan).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
        </div>
      </div>
      <div style={card}><strong>Recent signups</strong>
        <Table rows={d.recentSignups} cols={[['Email', r => r.email || r.user_id], ['Status', r => r.status], ['Tier', r => r.tier || '—'], ['Joined', r => fmtDate(r.created_at)]]} />
      </div>
      <div style={card}><strong>Recent payments</strong>
        <Table rows={d.recentPayments} cols={[['Email', r => r.email || r.user_id], ['Plan', r => r.plan], ['Amount', r => rupees(r.amount)], ['Coupon', r => r.coupon || ''], ['Receipt', r => r.receipt || ''], ['Date', r => fmtDate(r.created_at)]]} />
      </div>
    </div>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [grant, setGrant] = useState(null); // { userId, email, tier, days, lifetime, note }
  const [msg, setMsg] = useState('');
  const search = useCallback(async () => {
    setErr(''); setMsg('');
    try { setRes(await api(`users?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`)); } catch (e) { setErr(e.message); }
  }, [q, filter]);
  useEffect(() => { Promise.resolve().then(search); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const doGrant = async () => {
    setErr(''); setMsg('');
    try {
      await api('grant', { method: 'POST', body: JSON.stringify({ userId: grant.userId, tier: grant.tier, days: Number(grant.days), lifetime: grant.lifetime, note: grant.note }) });
      setMsg(`Granted ${grant.tier} to ${grant.email}`); setGrant(null); search();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      <form onSubmit={e => { e.preventDefault(); search(); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...inp, flex: '1 1 200px' }} placeholder="Email or user id" value={q} onChange={e => setQ(e.target.value)} />
        <select style={inp} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All</option><option value="trial">Trial</option><option value="free">Free / expired</option>
          <option value="paid">Paid</option><option value="expiring">Expiring ≤7d</option>
        </select>
        <button style={btn} type="submit">Search</button>
      </form>
      {err && <p style={{ color: '#dc2626', margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: '#059669', margin: 0 }}>{msg}</p>}
      {res && (
        <div style={card}>
          <Table rows={res.users} cols={[
            ['Email', r => r.email || r.user_id], ['Status', r => r.status], ['Effective', r => `${r.effective.tier} (${r.effective.source})`],
            ['Until', r => fmtDate(r.effective.until)], ['Plan', r => r.plan || '—'],
            ['', r => <button style={btn2} onClick={() => setGrant({ userId: r.user_id, email: r.email, tier: 'starter', days: 30, lifetime: false, note: '' })}>Grant…</button>],
          ]} />
        </div>
      )}
      {res && !Array.isArray(res.history) && res.history && (
        <div style={card}><strong>History</strong>
          <Table rows={res.history.orders} cols={[['Order', r => r.order_id], ['Plan', r => r.plan], ['Amount', r => rupees(r.amount)], ['Coupon', r => r.coupon_code || ''], ['Status', r => r.status], ['Created', r => fmtDate(r.created_at)]]} />
          <Table rows={res.history.actions} cols={[['Admin', r => r.admin_email], ['Action', r => r.action], ['Note', r => r.details?.request?.note || ''], ['When', r => fmtDate(r.created_at)]]} />
        </div>
      )}
      {grant && (
        <div style={{ ...card, borderColor: '#2563eb' }}>
          <strong>Manual grant for {grant.email}</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <select style={inp} value={grant.tier} onChange={e => setGrant({ ...grant, tier: e.target.value })}>
              {Object.keys(TIERS).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input style={{ ...inp, width: 90 }} type="number" min="1" max="3650" disabled={grant.lifetime || grant.tier === 'free'} value={grant.days} onChange={e => setGrant({ ...grant, days: e.target.value })} /> days
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={grant.lifetime} onChange={e => setGrant({ ...grant, lifetime: e.target.checked })} /> lifetime</label>
            <input style={{ ...inp, flex: '1 1 220px' }} placeholder="Reason (required, logged)" value={grant.note} onChange={e => setGrant({ ...grant, note: e.target.value })} />
            <button style={btn} disabled={!grant.note.trim()} onClick={doGrant}>Grant</button>
            <button style={btn2} onClick={() => setGrant(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Coupons() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ code: '', kind: 'percent', value: '', max_redemptions: '', valid_until: '', applies_to: '', note: '' });
  const load = useCallback(() => api('coupons').then(d => setList(d.coupons)).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const create = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const value = f.kind === 'flat' ? Math.round(Number(f.value) * 100) : Number(f.value);
      await api('coupons', { method: 'POST', body: JSON.stringify({ action: 'create', ...f, value, applies_to: f.applies_to ? [f.applies_to] : [] }) });
      setF({ ...f, code: '', value: '', note: '' }); load();
    } catch (e2) { setErr(e2.message); }
  };
  const toggle = async (c) => {
    try { await api('coupons', { method: 'POST', body: JSON.stringify({ action: 'set_active', code: c.code, active: !c.active }) }); load(); } catch (e) { setErr(e.message); }
  };
  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      <form onSubmit={create} style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 130, textTransform: 'uppercase' }} placeholder="CODE" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} required />
        <select style={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="percent">% off</option><option value="flat">₹ off</option></select>
        <input style={{ ...inp, width: 90 }} type="number" min="1" placeholder={f.kind === 'flat' ? '₹' : '%'} value={f.value} onChange={e => setF({ ...f, value: e.target.value })} required />
        <input style={{ ...inp, width: 110 }} type="number" min="1" placeholder="Max uses" value={f.max_redemptions} onChange={e => setF({ ...f, max_redemptions: e.target.value })} />
        <input style={inp} type="date" value={f.valid_until} onChange={e => setF({ ...f, valid_until: e.target.value })} title="Valid until" />
        <select style={inp} value={f.applies_to} onChange={e => setF({ ...f, applies_to: e.target.value })}>
          <option value="">All plans</option>{PURCHASABLE_PLAN_IDS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input style={{ ...inp, flex: '1 1 160px' }} placeholder="Note" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        <button style={btn} type="submit">Create coupon</button>
      </form>
      {err && <p style={{ color: '#dc2626', margin: 0 }}>{err}</p>}
      <div style={card}>
        {!list ? 'Loading…' : <Table rows={list} cols={[
          ['Code', r => r.code], ['Off', r => (r.kind === 'flat' ? rupees(r.value) : `${r.value}%`)],
          ['Used', r => `${r.redeemed_count ?? 0}${r.max_redemptions ? `/${r.max_redemptions}` : ''}`],
          ['Until', r => fmtDate(r.valid_until)], ['Plans', r => (r.applies_to || []).join(', ') || 'all'],
          ['Active', r => <button style={r.active ? btn : btn2} onClick={() => toggle(r)}>{r.active ? 'On' : 'Off'}</button>],
        ]} />}
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [state, setState] = useState('loading'); // loading | signin | denied | ok
  const [email, setEmail] = useState('');
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) { setState('signin'); return; }
      try { const me = await api('me'); setEmail(me.email); setState('ok'); } catch { setState('denied'); }
    })();
  }, []);
  const shell = { minHeight: '100vh', background: '#f1f5f9', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' };
  if (state !== 'ok') {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ ...card, maxWidth: 380, textAlign: 'center' }}>
          {state === 'loading' && 'Checking access…'}
          {state === 'signin' && <>Please <a href="/">sign in</a> first, then open /admin again.</>}
          {state === 'denied' && <>Not allowed. This page is only for GST Billing Pro admins. <div style={{ marginTop: 8 }}><a href="/">Back to app</a></div></>}
        </div>
      </div>
    );
  }
  const tabs = [['overview', 'Overview'], ['users', 'Users'], ['coupons', 'Coupons']];
  return (
    <div style={shell}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', padding: '0.7rem 1rem', background: '#0f172a', color: '#fff' }}>
        <strong style={{ flex: 1 }}>GST Billing Pro · Admin</strong>
        <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>{email}</span>
        <a href="/" style={{ color: '#93c5fd', fontSize: '0.85rem' }}>App</a>
      </header>
      <nav style={{ display: 'flex', gap: 6, padding: '0.7rem 1rem', overflowX: 'auto' }}>
        {tabs.map(([k, l]) => <button key={k} style={tab === k ? btn : btn2} onClick={() => setTab(k)}>{l}</button>)}
      </nav>
      <main style={{ padding: '0 1rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <Users />}
        {tab === 'coupons' && <Coupons />}
      </main>
    </div>
  );
}
