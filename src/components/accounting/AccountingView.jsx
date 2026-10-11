import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, LayoutGrid, CalendarDays, Wallet, Users, BarChart3, FileText, ListTree, RefreshCw, Plus, Trash2, Download, MessageCircle, Landmark, Scale,
} from 'lucide-react';
import PageHeader from '../PageHeader';
import BottomSheet from '../mobile/BottomSheet';
import ModuleGate, { ModuleTabs, EmptyState } from '../modules/ModuleGate';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';
import { t as tr } from '../../i18n';
import { formatCurrency } from '../../utils';
import { openInNewTab, whatsAppUrl } from '../../utils/share';
import { getAllProducts, getAllClients } from '../../store-supabase';
import {
  ACC_TABLES, canWriteBooks, bizKeyOf, loadBooks, saveSettings, saveAccount, saveVoucher, deleteVoucher, syncAutoVouchers, nextVoucherNo,
} from '../../lib/accData';
import {
  chartOfAccounts, fyStartYear, fyRange, fyLabel, fyList, validateVoucher, cleanVoucher, voucherTotals, openingVoucher, MANUAL_TYPES,
  accountBalances, ledger, partyBalances, dayBook, trialBalance, profitAndLoss, balanceSheet, partyKey, r2, ACCOUNT_TYPES, GROUPS,
} from '../../../shared/accounting.js';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDay = (d) => { try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); } catch { return d; } };
const money = (n) => formatCurrency(Math.abs(Number(n) || 0));
const drcr = (n) => (Math.abs(n) < 0.005 ? formatCurrency(0) : `${money(n)} ${n > 0 ? tr('acc.dr') : tr('acc.cr')}`);
const SUBS = ['daybook', 'ledgers', 'parties', 'reports', 'vouchers', 'chart'];

export default function AccountingView(props) {
  return (
    <ModuleGate module="accounting" tables={ACC_TABLES} title={tr('acc.title')} icon={<BookOpen size={22} />}>
      <Books {...props} />
    </ModuleGate>
  );
}

// Derive auto vouchers from bills etc. and write the differences (no React state here).
async function syncOnce(biz, profile) {
  try {
    const cur = await loadBooks(biz);
    const res = await syncAutoVouchers({ biz, profile, stored: cur.vouchers, bankId: cur.settings.bankId || 'bank' });
    await saveSettings({ ...cur.settings, lastSync: new Date().toISOString() }).catch(() => {});
    return res;
  } catch (e) { console.warn(e); toast(tr('acc.syncFailed'), 'error'); return null; }
}

function Books({ sub, onSub, profile }) {
  const biz = bizKeyOf(profile);
  const tab = SUBS.includes(sub) ? sub : '';
  const [books, setBooks] = useState(null);
  const [fy, setFy] = useState(() => fyStartYear(todayISO()));
  const canWrite = canWriteBooks();
  const [syncing, setSyncing] = useState(canWrite);
  const [sheet, setSheet] = useState(null); // {voucher} | {opening:true}

  const reload = useCallback(() => loadBooks(biz).then(setBooks, (e) => { console.warn(e); toast(tr('mod.loadError'), 'error'); setBooks(b => b || { accounts: [], vouchers: [], settings: {} }); }), [biz]);
  const sync = useCallback((manual) => syncOnce(biz, profile).then((res) => {
    if (manual && res) toast(tr('acc.synced', { added: res.added, removed: res.removed }), 'success');
    setSyncing(false);
    return reload();
  }), [biz, profile, reload]);
  useEffect(() => { (canWrite ? sync(false) : reload()); }, [canWrite, sync, reload]);

  const chart = useMemo(() => chartOfAccounts(books?.accounts || [], books?.vouchers || []), [books]);
  const names = useMemo(() => Object.fromEntries(chart.map(a => [a.id, a.name])), [chart]);
  const fys = useMemo(() => fyList(books?.vouchers || [], todayISO()), [books]);
  const range = fyRange(fy);

  const tabs = [
    { id: '', label: tr('acc.tabOverview'), icon: LayoutGrid },
    { id: 'daybook', label: tr('acc.tabDayBook'), icon: CalendarDays },
    { id: 'ledgers', label: tr('acc.tabLedgers'), icon: Wallet },
    { id: 'parties', label: tr('acc.tabParties'), icon: Users },
    { id: 'reports', label: tr('acc.tabReports'), icon: BarChart3 },
    { id: 'vouchers', label: tr('acc.tabVouchers'), icon: FileText },
    { id: 'chart', label: tr('acc.tabChart'), icon: ListTree },
  ];
  const ctx = { books, chart, names, fy, range, biz, profile, canWrite, reload, setSheet };
  return (
    <div className="mod-page no-mcards">
      <PageHeader icon={<BookOpen size={20} />} title={tr('acc.title')} subtitle={tr('acc.subtitle')}>
        <select className="form-input" style={{ width: 'auto' }} value={fy} onChange={e => setFy(Number(e.target.value))} aria-label={tr('acc.fy')} data-testid="acc-fy">
          {fys.map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
        </select>
        <button type="button" className="mod-icon-btn" disabled={syncing} onClick={() => { if (canWrite) { setSyncing(true); sync(true); } else reload(); }} aria-label={tr('acc.sync')}><RefreshCw size={18} className={syncing ? 'spin' : ''} /></button>
      </PageHeader>
      <ModuleTabs tabs={tabs} active={tab} onChange={onSub} />
      {!books ? <div className="mod-card mod-muted">{syncing ? tr('acc.syncing') : tr('mod.loading')}</div> : (
        <>
          {tab === '' && <Overview {...ctx} syncing={syncing} onSync={() => { setSyncing(true); sync(true); }} onSub={onSub} />}
          {tab === 'daybook' && <DayBookTab {...ctx} />}
          {tab === 'ledgers' && <LedgersTab {...ctx} />}
          {tab === 'parties' && <PartiesTab {...ctx} />}
          {tab === 'reports' && <ReportsTab {...ctx} />}
          {tab === 'vouchers' && <VouchersTab {...ctx} />}
          {tab === 'chart' && <ChartTab {...ctx} />}
        </>
      )}
      {sheet && <VoucherSheet {...ctx} sheet={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return <div className="mod-stat"><span className="mod-muted">{label}</span><b style={tone ? { color: tone } : undefined}>{value}</b></div>;
}

function Overview({ books, chart, range, fy, canWrite, syncing, onSync, setSheet, onSub }) {
  const bal = useMemo(() => accountBalances(books.vouchers, { to: range.to }), [books, range.to]);
  const pl = useMemo(() => {
    const cs = books.settings.closingStock || {};
    return profitAndLoss(books.vouchers, chart, { ...range, closingStock: cs[fy], openingStock: cs[fy - 1] });
  }, [books, chart, range, fy]);
  const get = (id) => bal.get(id)?.close || 0;
  const bank = chart.filter(a => a.group === 'bank').reduce((s, a) => s + get(a.id), 0);
  const autos = books.vouchers.filter(v => v.source === 'auto').length;
  return (
    <>
      <div className="mod-grid">
        <Stat label={tr('acc.cash')} value={formatCurrency(get('cash'))} />
        <Stat label={tr('acc.bank')} value={formatCurrency(bank)} />
        <Stat label={tr('acc.receivable')} value={formatCurrency(get('debtors'))} tone="#0f766e" />
        <Stat label={tr('acc.payable')} value={formatCurrency(-get('creditors'))} tone="#b45309" />
        <Stat label={tr('acc.salesFy')} value={formatCurrency(pl.tradingIncome.reduce((s, r) => s + r.amount, 0))} />
        <Stat label={pl.netProfit >= 0 ? tr('acc.netProfit') : tr('acc.netLoss')} value={formatCurrency(Math.abs(pl.netProfit))} tone={pl.netProfit >= 0 ? '#16a34a' : '#dc2626'} />
      </div>
      <div className="mod-card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>{tr('acc.autoTitle')}</div>
        <p className="mod-muted" style={{ margin: '4px 0 10px' }}>{tr('acc.autoBody', { count: autos })}{books.settings.lastSync ? ` · ${tr('acc.lastSync')}: ${new Date(books.settings.lastSync).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
        {canWrite && <button type="button" className="btn btn-secondary" disabled={syncing} onClick={onSync} data-testid="acc-sync"><RefreshCw size={16} /> {syncing ? tr('acc.syncing') : tr('acc.syncNow')}</button>}
      </div>
      {canWrite && (
        <div className="mod-actions">
          <button type="button" className="btn btn-primary" onClick={() => setSheet({ voucher: { type: 'journal' } })}><Plus size={16} /> {tr('acc.newVoucher')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setSheet({ opening: true })}><Scale size={16} /> {tr('acc.openingBalances')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => onSub('reports')}><BarChart3 size={16} /> {tr('acc.tabReports')}</button>
        </div>
      )}
    </>
  );
}

function VoucherRow({ v, names, onOpen }) {
  const [open, setOpen] = useState(false);
  const t = voucherTotals(v);
  return (
    <div className="mod-row" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }} data-testid="acc-voucher" role="button" tabIndex={0}
      onClick={() => (onOpen ? onOpen(v) : setOpen(o => !o))} onKeyDown={e => { if (e.key === 'Enter') setOpen(o => !o); }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="mod-row-main">
          <div className="mod-row-title">{v.narration || names[v.lines?.[0]?.a] || v.no}</div>
          <div className="mod-row-sub">{fmtDay(v.date)} · <span className="mod-chip">{tr(`acc.vt_${v.type}`)}</span> {v.no}</div>
        </div>
        <div className="mod-amt">{formatCurrency(t.dr)}</div>
      </div>
      {open && (
        <table className="mod-table" style={{ marginTop: 6 }}>
          <tbody>
            {v.lines.map((l, i) => (
              <tr key={i}><td>{names[l.a] || l.n || l.a}{l.p ? ` — ${l.p}` : ''}</td><td style={{ textAlign: 'right' }}>{l.dr ? formatCurrency(l.dr) : ''}</td><td style={{ textAlign: 'right' }}>{l.cr ? formatCurrency(l.cr) : ''}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DayBookTab({ books, names }) {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const list = useMemo(() => dayBook(books.vouchers, { from, to }), [books, from, to]);
  const month = () => { const t = todayISO(); setFrom(`${t.slice(0, 8)}01`); setTo(t); };
  return (
    <>
      <div className="mod-toolbar">
        <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} aria-label={tr('acc.from')} />
        <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} aria-label={tr('acc.to')} />
      </div>
      <div className="mod-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-secondary" onClick={() => { setFrom(todayISO()); setTo(todayISO()); }}>{tr('acc.today')}</button>
        <button type="button" className="btn btn-secondary" onClick={month}>{tr('acc.thisMonth')}</button>
      </div>
      {!list.length ? <EmptyState icon={CalendarDays} text={tr('acc.noEntries')} /> : (
        <div className="mod-list">{list.map(v => <VoucherRow key={v.id} v={v} names={names} />)}</div>
      )}
    </>
  );
}

function LedgerTable({ led }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="mod-table" data-testid="acc-ledger">
        <thead><tr><th>{tr('acc.date')}</th><th>{tr('acc.particulars')}</th><th style={{ textAlign: 'right' }}>{tr('acc.debit')}</th><th style={{ textAlign: 'right' }}>{tr('acc.credit')}</th><th style={{ textAlign: 'right' }}>{tr('acc.balance')}</th></tr></thead>
        <tbody>
          <tr><td /><td><b>{tr('acc.openingBal')}</b></td><td /><td /><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{drcr(led.opening)}</td></tr>
          {led.rows.map(r => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(r.date)}</td>
              <td style={{ minWidth: 140 }}><div>{r.narration || r.other}</div><div className="mod-muted" style={{ fontSize: '.78rem' }}>{tr(`acc.vt_${r.type}`)} {r.no}{r.narration && r.other ? ` · ${r.other}` : ''}</div></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.dr ? formatCurrency(r.dr) : ''}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.cr ? formatCurrency(r.cr) : ''}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{drcr(r.bal)}</td>
            </tr>
          ))}
          <tr><td /><td><b>{tr('acc.closingBal')}</b></td><td style={{ textAlign: 'right' }}><b>{formatCurrency(led.dr)}</b></td><td style={{ textAlign: 'right' }}><b>{formatCurrency(led.cr)}</b></td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b>{drcr(led.closing)}</b></td></tr>
        </tbody>
      </table>
    </div>
  );
}

function LedgersTab({ books, chart, names, range }) {
  const [acc, setAcc] = useState('cash');
  const banks = chart.filter(a => a.group === 'bank');
  const led = useMemo(() => ledger(books.vouchers, acc, { ...range, names }), [books, acc, range, names]);
  return (
    <>
      <div className="mod-tabs">
        <button type="button" className={`mod-tab${acc === 'cash' ? ' active' : ''}`} onClick={() => setAcc('cash')}><Wallet size={16} /> {tr('acc.cashBook')}</button>
        {banks.map(b => <button type="button" key={b.id} className={`mod-tab${acc === b.id ? ' active' : ''}`} onClick={() => setAcc(b.id)}><Landmark size={16} /> {b.name}</button>)}
      </div>
      <div className="mod-toolbar">
        <select className="form-input" value={acc} onChange={e => setAcc(e.target.value)} aria-label={tr('acc.account')}>
          {ACCOUNT_TYPES.map(t => (
            <optgroup key={t} label={tr(`acc.t_${t}`)}>
              {chart.filter(a => a.type === t).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="mod-card"><LedgerTable led={led} /></div>
    </>
  );
}

async function statementPdf({ profile, party, led, range }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 12; let y = 14;
  const ascii = (s) => String(s || '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '');
  const amt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bal = (n) => (Math.abs(n) < 0.005 ? '0.00' : `${amt(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`);
  doc.setFontSize(14); doc.text(ascii(profile?.businessName || 'Statement'), L, y); y += 6;
  doc.setFontSize(9); if (profile?.gstin) { doc.text(`GSTIN: ${ascii(profile.gstin)}`, L, y); y += 5; }
  doc.setFontSize(12); doc.text(ascii(`Account statement: ${party}`), L, y); y += 6;
  doc.setFontSize(9); doc.text(`Period: ${range.from} to ${range.to}`, L, y); y += 7;
  const cols = [L, L + 22, L + 112, L + 140, L + 168];
  const head = () => { doc.setFont(undefined, 'bold'); ['Date', 'Particulars', 'Debit', 'Credit', 'Balance'].forEach((h, i) => doc.text(h, cols[i] + (i >= 2 ? 26 : 0), y, i >= 2 ? { align: 'right' } : undefined)); doc.setFont(undefined, 'normal'); y += 2; doc.line(L, y, 198, y); y += 5; };
  head();
  const row = (c) => {
    if (y > 280) { doc.addPage(); y = 14; head(); }
    doc.text(c[0], cols[0], y);
    doc.text(doc.splitTextToSize(ascii(c[1]), 86)[0] || '', cols[1], y);
    [c[2], c[3], c[4]].forEach((v, i) => doc.text(v, cols[i + 2] + 26, y, { align: 'right' }));
    y += 6;
  };
  row(['', 'Opening balance', '', '', bal(led.opening)]);
  for (const r of led.rows) row([r.date.split('-').reverse().join('-'), `${r.no} ${r.narration || r.other}`, r.dr ? amt(r.dr) : '', r.cr ? amt(r.cr) : '', bal(r.bal)]);
  doc.line(L, y - 3, 198, y - 3);
  doc.setFont(undefined, 'bold'); row(['', 'Closing balance', amt(led.dr), amt(led.cr), bal(led.closing)]);
  return doc.output('blob');
}

function PartiesTab({ books, names, range, profile }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [phones, setPhones] = useState({});
  const parties = useMemo(() => partyBalances(books.vouchers, { to: range.to }), [books, range.to]);
  useEffect(() => {
    getAllClients().then(cs => setPhones(Object.fromEntries((cs || []).filter(c => c.phone).map(c => [partyKey(c.name), c.phone]))), () => {});
  }, []);
  if (sel) {
    const led = ledger(books.vouchers, ['debtors', 'creditors'], { ...range, party: sel.name, names });
    const fileName = `Statement-${sel.name.replace(/[^\w]+/g, '_')}-${range.from.slice(0, 4)}.pdf`;
    const pdf = async () => {
      const blob = await statementPdf({ profile, party: sel.name, led, range });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    const share = async () => {
      const text = tr('acc.waStatement', { name: sel.name, balance: drcr(led.closing), from: fmtDay(range.from), to: fmtDay(range.to), business: profile?.businessName || '' });
      try {
        const blob = await statementPdf({ profile, party: sel.name, led, range });
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      } catch (e) { if (e?.name === 'AbortError') return; }
      openInNewTab(whatsAppUrl(phones[partyKey(sel.name)] || '', text));
    };
    return (
      <>
        <div className="mod-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setSel(null)}>← {tr('acc.allParties')}</button>
          <button type="button" className="btn btn-secondary" onClick={pdf} data-testid="acc-pdf"><Download size={16} /> PDF</button>
          <button type="button" className="btn btn-primary" onClick={share}><MessageCircle size={16} /> WhatsApp</button>
        </div>
        <div className="mod-card">
          <div className="mod-row-title" style={{ fontSize: '1.05rem', marginBottom: 6 }}>{sel.name}</div>
          <LedgerTable led={led} />
        </div>
      </>
    );
  }
  const list = parties.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mod-toolbar"><input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder={tr('acc.searchParty')} /></div>
      {!list.length ? <EmptyState icon={Users} text={tr('acc.noParties')} /> : (
        <div className="mod-list">
          {list.map(p => (
            <div key={p.name} className="mod-row" role="button" tabIndex={0} style={{ cursor: 'pointer' }} data-testid="acc-party" onClick={() => setSel(p)} onKeyDown={e => { if (e.key === 'Enter') setSel(p); }}>
              <div className="mod-row-main"><div className="mod-row-title">{p.name}</div><div className="mod-row-sub">{p.net > 0 ? tr('acc.toReceive') : p.net < 0 ? tr('acc.toPay') : tr('acc.settled')}</div></div>
              <div className="mod-amt" style={{ color: p.net > 0 ? '#0f766e' : p.net < 0 ? '#b45309' : undefined }}>{money(p.net)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Row({ name, amount, bold }) {
  return <tr><td>{bold ? <b>{name}</b> : name}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{bold ? <b>{formatCurrency(amount)}</b> : formatCurrency(amount)}</td></tr>;
}

function ReportsTab({ books, chart, range, fy, canWrite, reload }) {
  const [kind, setKind] = useState('pl');
  const [invValue, setInvValue] = useState(null);
  const cs = books.settings.closingStock || {};
  const isCurrent = fy === fyStartYear(todayISO());
  useEffect(() => {
    getAllProducts().then(ps => setInvValue(r2((ps || []).reduce((s, p) => s + Math.max(0, Number(p.stock) || 0) * (Number(p.purchasePrice) || 0), 0))), () => setInvValue(0));
  }, []);
  // Closing stock only moves profit when the owner sets it (with opening
  // stock in Opening balances); the inventory value is offered as a hint.
  const closing = cs[fy] ?? null;
  const opening = cs[fy - 1];
  const opts = { ...range, closingStock: closing, openingStock: opening };
  const saveClosing = async (val) => {
    try { await saveSettings({ ...books.settings, closingStock: { ...cs, [fy]: val === '' ? undefined : r2(val) } }); reload(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  let body = null;
  if (kind === 'tb') {
    const tb = trialBalance(books.vouchers, chart, range);
    body = (
      <table className="mod-table" data-testid="acc-tb">
        <thead><tr><th>{tr('acc.account')}</th><th style={{ textAlign: 'right' }}>{tr('acc.debit')}</th><th style={{ textAlign: 'right' }}>{tr('acc.credit')}</th></tr></thead>
        <tbody>
          {tb.rows.map(r => <tr key={r.id}><td>{r.id === '_retained' ? tr('acc.retained') : r.name}</td><td style={{ textAlign: 'right' }}>{r.dr ? formatCurrency(r.dr) : ''}</td><td style={{ textAlign: 'right' }}>{r.cr ? formatCurrency(r.cr) : ''}</td></tr>)}
          <tr><td><b>{tr('acc.total')}</b></td><td style={{ textAlign: 'right' }}><b>{formatCurrency(tb.dr)}</b></td><td style={{ textAlign: 'right' }}><b>{formatCurrency(tb.cr)}</b></td></tr>
        </tbody>
      </table>
    );
  } else if (kind === 'pl') {
    const pl = profitAndLoss(books.vouchers, chart, opts);
    body = (
      <table className="mod-table" data-testid="acc-pl">
        <tbody>
          <tr><td colSpan={2} className="mod-muted"><b>{tr('acc.trading')}</b></td></tr>
          {pl.tradingIncome.map(r => <Row key={r.id} name={r.name} amount={r.amount} />)}
          <Row name={`${tr('acc.openingStock')} (−)`} amount={pl.openingStock} />
          {pl.tradingExp.map(r => <Row key={r.id} name={`${r.name} (−)`} amount={r.amount} />)}
          <Row name={`${tr('acc.closingStock')} (+)`} amount={pl.closingStock} />
          <Row name={tr('acc.grossProfit')} amount={pl.grossProfit} bold />
          <tr><td colSpan={2} className="mod-muted"><b>{tr('acc.indirect')}</b></td></tr>
          {pl.otherIncome.map(r => <Row key={r.id} name={`${r.name} (+)`} amount={r.amount} />)}
          {pl.otherExp.map(r => <Row key={r.id} name={`${r.name} (−)`} amount={r.amount} />)}
          <Row name={pl.netProfit >= 0 ? tr('acc.netProfit') : tr('acc.netLoss')} amount={Math.abs(pl.netProfit)} bold />
        </tbody>
      </table>
    );
  } else {
    const bs = balanceSheet(books.vouchers, chart, opts);
    const side = (groups, title) => (
      <>
        <tr><td colSpan={2} className="mod-muted"><b>{title}</b></td></tr>
        {groups.map(g => (
          <tr key={g.group}><td><div><b>{tr(`acc.g_${g.group}`)}</b></div>{g.items.map(i => <div key={i.id} className="mod-muted" style={{ fontSize: '.8rem' }}>{i.id === '_retained' ? tr('acc.retained') : i.id === '_current' ? tr('acc.currentProfit') : i.name}: {formatCurrency(i.amount)}</div>)}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(g.total)}</td></tr>
        ))}
      </>
    );
    body = (
      <table className="mod-table" data-testid="acc-bs">
        <tbody>
          {side([...bs.equity, ...bs.liabilities], tr('acc.liabilitiesCapital'))}
          <Row name={tr('acc.total')} amount={bs.totalLiabilities} bold />
          {side(bs.assets, tr('acc.assets'))}
          <Row name={tr('acc.total')} amount={bs.totalAssets} bold />
          {Math.abs(bs.diff) >= 0.01 && <tr><td colSpan={2} style={{ color: '#dc2626' }}>{tr('acc.diff')}: {formatCurrency(bs.diff)}</td></tr>}
        </tbody>
      </table>
    );
  }
  return (
    <>
      <div className="mod-tabs">
        {[['pl', tr('acc.pl')], ['bs', tr('acc.bs')], ['tb', tr('acc.tb')]].map(([id, label]) => (
          <button type="button" key={id} className={`mod-tab${kind === id ? ' active' : ''}`} onClick={() => setKind(id)}>{label}</button>
        ))}
      </div>
      {kind !== 'tb' && (
        <div className="mod-card">
          <label className="mod-form" style={{ display: 'block' }}>{tr('acc.closingStock')} ({fyLabel(fy)})
            <input key={`${fy}-${closing}`} className="form-input" type="number" inputMode="decimal" min="0" defaultValue={closing ?? ''} disabled={!canWrite}
              onBlur={e => { if (String(e.target.value) !== String(closing ?? '')) saveClosing(e.target.value); }} />
          </label>
          <div className="mod-muted" style={{ fontSize: '.8rem' }}>{tr('acc.stockManual')}</div>
          {canWrite && isCurrent && invValue > 0 && cs[fy] == null && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => saveClosing(invValue)}>{tr('acc.useInventory', { amount: formatCurrency(invValue) })}</button>
          )}
        </div>
      )}
      <div className="mod-card" style={{ overflowX: 'auto' }}>{body}</div>
    </>
  );
}

function VouchersTab({ books, names, range, canWrite, setSheet }) {
  const list = books.vouchers.filter(v => v.source !== 'auto' && v.date >= range.from && v.date <= range.to).sort((a, b) => b.date.localeCompare(a.date));
  const opening = books.vouchers.find(v => v.type === 'opening');
  return (
    <>
      {canWrite && (
        <div className="mod-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-primary" onClick={() => setSheet({ voucher: { type: 'journal' } })} data-testid="acc-new-voucher"><Plus size={16} /> {tr('acc.newVoucher')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setSheet({ opening: true })}><Scale size={16} /> {tr('acc.openingBalances')}{opening ? ` (${fmtDay(opening.date)})` : ''}</button>
        </div>
      )}
      <p className="mod-muted" style={{ fontSize: '.85rem' }}>{tr('acc.vouchersHint')}</p>
      {!list.length ? <EmptyState icon={FileText} text={tr('acc.noVouchers')} /> : (
        <div className="mod-list">{list.map(v => <VoucherRow key={v.id} v={v} names={names} onOpen={canWrite && v.source === 'manual' ? (x) => setSheet(x.type === 'opening' ? { opening: true } : { voucher: x }) : undefined} />)}</div>
      )}
    </>
  );
}

function VoucherSheet({ sheet, onClose, books, chart, biz, reload }) {
  const opening = !!sheet.opening;
  const existingOpening = books.vouchers.find(v => v.type === 'opening');
  const start = sheet.voucher || (existingOpening ? { ...existingOpening, lines: existingOpening.lines.filter(l => l.a !== 'ob_diff') } : { type: 'opening', date: fyRange(fyStartYear(todayISO())).from });
  const [v, setV] = useState(() => ({ date: todayISO(), narration: '', ...start, lines: start.lines?.length ? start.lines.map(l => ({ ...l })) : [{ a: opening ? 'cash' : '', dr: '', cr: '' }, { a: '', dr: '', cr: '' }] }));
  const [busy, setBusy] = useState(false);
  const accounts = chart.filter(a => !a.hidden && (!opening || ['asset', 'liability', 'equity'].includes(a.type)));
  const party = (id) => chart.find(a => a.id === id)?.party;
  const setLine = (i, k, val) => setV(x => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, [k]: val, ...(k === 'dr' && val ? { cr: '' } : {}), ...(k === 'cr' && val ? { dr: '' } : {}) } : l)) }));
  const t = voucherTotals(v);
  const diff = r2(t.dr - t.cr);
  const save = async () => {
    let rec;
    if (opening) {
      rec = { ...openingVoucher(v.lines.filter(l => l.a), v.date), id: existingOpening?.id || `opening:${biz}` };
      if (rec.lines.length < 2) { toast(tr('acc.err_need_two_lines'), 'warning'); return; }
    } else {
      rec = cleanVoucher(v);
      const err = validateVoucher(rec);
      if (err) { toast(tr(`acc.err_${err}`), 'warning'); return; }
      if (!rec.no) rec.no = nextVoucherNo(books.vouchers, rec.type, rec.date);
    }
    setBusy(true);
    try { await saveVoucher(rec, biz); toast(tr('acc.saved'), 'success'); await reload(); onClose(); } catch (e) { console.warn(e); toast(tr('mod.saveError'), 'error'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirmAction({ title: tr('acc.deleteVoucher'), message: v.no || '', tone: 'danger', confirmLabel: tr('mod.delete'), cancelLabel: tr('mod.cancel') }))) return;
    try { await deleteVoucher(v.id); await reload(); onClose(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  return (
    <BottomSheet title={opening ? tr('acc.openingBalances') : (v.id ? `${tr(`acc.vt_${v.type}`)} ${v.no || ''}` : tr('acc.newVoucher'))} onClose={onClose}>
      <div className="mod-form two">
        {!opening && (
          <label>{tr('acc.voucherType')}
            <select className="form-input" value={v.type} onChange={e => setV(x => ({ ...x, type: e.target.value, no: x.id ? x.no : '' }))}>
              {MANUAL_TYPES.map(ty => <option key={ty} value={ty}>{tr(`acc.vt_${ty}`)}</option>)}
            </select>
          </label>
        )}
        <label>{opening ? tr('acc.asOn') : tr('acc.date')}<input type="date" className="form-input" value={v.date} onChange={e => setV(x => ({ ...x, date: e.target.value }))} /></label>
      </div>
      {opening && <p className="mod-muted" style={{ fontSize: '.85rem' }}>{tr('acc.openingHint')}</p>}
      <div style={{ display: 'grid', gap: 8, margin: '10px 0' }}>
        {v.lines.map((l, i) => (
          <div key={i} className="mod-card" style={{ padding: 10, margin: 0 }} data-testid="acc-line">
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="form-input" value={l.a} onChange={e => setLine(i, 'a', e.target.value)} aria-label={tr('acc.account')}>
                <option value="">{tr('acc.pickAccount')}</option>
                {ACCOUNT_TYPES.map(ty => (
                  <optgroup key={ty} label={tr(`acc.t_${ty}`)}>{accounts.filter(a => a.type === ty).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                ))}
              </select>
              {v.lines.length > 2 && <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={() => setV(x => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}><Trash2 size={16} /></button>}
            </div>
            {party(l.a) && <input className="form-input" style={{ marginTop: 6 }} value={l.p || ''} onChange={e => setLine(i, 'p', e.target.value)} placeholder={tr('acc.partyName')} />}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input className="form-input" type="number" inputMode="decimal" min="0" placeholder={tr('acc.debit')} value={l.dr || ''} onChange={e => setLine(i, 'dr', e.target.value)} />
              <input className="form-input" type="number" inputMode="decimal" min="0" placeholder={tr('acc.credit')} value={l.cr || ''} onChange={e => setLine(i, 'cr', e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => setV(x => ({ ...x, lines: [...x.lines, { a: '', dr: diff < 0 ? -diff : '', cr: diff > 0 ? diff : '' }] }))}><Plus size={16} /> {tr('acc.addLine')}</button>
      <div className="mod-row" style={{ marginTop: 10 }}>
        <div className="mod-row-main"><div>{tr('acc.debit')}: <b>{formatCurrency(t.dr)}</b> · {tr('acc.credit')}: <b>{formatCurrency(t.cr)}</b></div>
          {Math.abs(diff) >= 0.005 && <div style={{ color: opening ? '#b45309' : '#dc2626', fontSize: '.85rem' }}>{opening ? tr('acc.obDiffNote', { amount: drcr(-diff) }) : tr('acc.err_not_balanced')}: {formatCurrency(Math.abs(diff))}</div>}
        </div>
      </div>
      {!opening && <label className="mod-form" style={{ display: 'block' }}>{tr('acc.narration')}<input className="form-input" value={v.narration} onChange={e => setV(x => ({ ...x, narration: e.target.value }))} maxLength={500} /></label>}
      <div className="mod-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save} data-testid="acc-save">{busy ? tr('mod.saving') : tr('acc.save')}</button>
        {v.id && <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={remove}><Trash2 size={18} /></button>}
      </div>
    </BottomSheet>
  );
}

function ChartTab({ books, chart, range, canWrite, reload }) {
  const [adding, setAdding] = useState(null);
  const bal = useMemo(() => accountBalances(books.vouchers, { to: range.to }), [books, range.to]);
  const banks = chart.filter(a => a.group === 'bank');
  const add = async () => {
    const name = String(adding.name || '').trim();
    if (!name) { toast(tr('acc.err_name'), 'warning'); return; }
    try { await saveAccount({ name: name.slice(0, 80), type: adding.type, group: adding.group }); toast(tr('acc.saved'), 'success'); setAdding(null); reload(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  const setBank = async (bankId) => { try { await saveSettings({ ...books.settings, bankId }); toast(tr('acc.saved'), 'success'); reload(); } catch { toast(tr('mod.saveError'), 'error'); } };
  return (
    <>
      {canWrite && (
        <div className="mod-card">
          <label className="mod-form" style={{ display: 'block' }}>{tr('acc.defaultBank')}
            <select className="form-input" value={books.settings.bankId || 'bank'} onChange={e => setBank(e.target.value)}>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className="mod-muted" style={{ fontSize: '.8rem' }}>{tr('acc.defaultBankHint')}</div>
          <div className="mod-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setAdding({ type: 'asset', group: 'bank', name: '' })} data-testid="acc-add-bank"><Landmark size={16} /> {tr('acc.addBank')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setAdding({ type: 'expense', group: 'indirect_exp', name: '' })}><Plus size={16} /> {tr('acc.addAccount')}</button>
          </div>
        </div>
      )}
      {adding && (
        <div className="mod-card mod-form">
          <label>{tr('acc.accountName')}<input className="form-input" value={adding.name} onChange={e => setAdding(a => ({ ...a, name: e.target.value }))} autoFocus maxLength={80} /></label>
          <div className="row2">
            <label>{tr('acc.type')}<select className="form-input" value={adding.type} onChange={e => setAdding(a => ({ ...a, type: e.target.value, group: GROUPS[e.target.value][0] }))}>{ACCOUNT_TYPES.map(t => <option key={t} value={t}>{tr(`acc.t_${t}`)}</option>)}</select></label>
            <label>{tr('acc.group')}<select className="form-input" value={adding.group} onChange={e => setAdding(a => ({ ...a, group: e.target.value }))}>{GROUPS[adding.type].map(g => <option key={g} value={g}>{tr(`acc.g_${g}`)}</option>)}</select></label>
          </div>
          <div className="mod-actions"><button type="button" className="btn btn-primary" onClick={add}>{tr('acc.save')}</button><button type="button" className="btn btn-secondary" onClick={() => setAdding(null)}>{tr('mod.cancel')}</button></div>
        </div>
      )}
      {ACCOUNT_TYPES.map(t => (
        <div key={t} className="mod-card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{tr(`acc.t_${t}`)}</div>
          <table className="mod-table"><tbody>
            {chart.filter(a => a.type === t).map(a => {
              const c = bal.get(a.id)?.close || 0;
              return <tr key={a.id}><td>{a.name}<div className="mod-muted" style={{ fontSize: '.75rem' }}>{tr(`acc.g_${a.group}`)}</div></td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{c ? drcr(c) : '—'}</td></tr>;
            })}
          </tbody></table>
        </div>
      ))}
    </>
  );
}
