import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users2, CalendarCheck, CalendarDays, IndianRupee, HandCoins, UserPlus, Trash2, Download, MessageCircle, Check, RotateCcw, Phone } from 'lucide-react';
import PageHeader from '../PageHeader';
import BottomSheet from '../mobile/BottomSheet';
import ModuleGate, { ModuleTabs, EmptyState } from '../modules/ModuleGate';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';
import { t as tr } from '../../i18n';
import { formatCurrency } from '../../utils';
import { openInNewTab, whatsAppUrl } from '../../utils/share';
import { bizKeyOf } from '../../lib/accData';
import {
  PAY_TABLES, listEmployees, saveEmployee, deleteEmployee, listAttendance, markAttendance, listAdvances, saveAdvance, deleteAdvance, listSalaries, markSalaryPaid, undoSalaryPaid,
} from '../../lib/payData';
import {
  SALARY_TYPES, ATT_CODES, cleanEmployee, calcSalary, attendanceSummary, monthDates, monthOf, advanceBalance, suggestedRecovery, slipText,
} from '../../../shared/payroll.js';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const monthLabel = (m) => { try { return new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); } catch { return m; } };
const fmtDay = (d) => { try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return d; } };
const SUBS = ['month', 'salary', 'advances', 'employees'];
const NEXT = { '': 'P', P: 'A', A: 'H', H: 'L', L: '' };

export default function PayrollView(props) {
  return (
    <ModuleGate module="payroll" tables={PAY_TABLES} title={tr('pay.title')} icon={<Users2 size={22} />}>
      <Payroll {...props} />
    </ModuleGate>
  );
}

function Payroll({ sub, onSub, profile }) {
  const biz = bizKeyOf(profile);
  const tab = SUBS.includes(sub) ? sub : '';
  const [emps, setEmps] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [editing, setEditing] = useState(null);
  const reload = useCallback(() => Promise.all([listEmployees(), listAdvances(), listSalaries()]).then(([e, a, s]) => { setEmps(e); setAdvances(a); setSalaries(s); },
    (e) => { console.warn(e); toast(tr('mod.loadError'), 'error'); setEmps(x => x || []); }), []);
  useEffect(() => { reload(); }, [reload]);
  const active = useMemo(() => (emps || []).filter(e => e.active !== false), [emps]);
  const tabs = [
    { id: '', label: tr('pay.tabToday'), icon: CalendarCheck },
    { id: 'month', label: tr('pay.tabMonth'), icon: CalendarDays },
    { id: 'salary', label: tr('pay.tabSalary'), icon: IndianRupee },
    { id: 'advances', label: tr('pay.tabAdvances'), icon: HandCoins },
    { id: 'employees', label: tr('pay.tabEmployees'), icon: Users2 },
  ];
  const ctx = { emps: emps || [], active, advances, salaries, reload, biz, profile, setEditing, onSub };
  return (
    <div className="mod-page no-mcards">
      <PageHeader icon={<Users2 size={20} />} title={tr('pay.title')} subtitle={tr('pay.subtitle')} />
      <ModuleTabs tabs={tabs} active={tab} onChange={onSub} />
      {emps === null ? <div className="mod-card mod-muted">{tr('mod.loading')}</div> : (!emps.length && tab !== 'employees') ? (
        <EmptyState icon={Users2} text={tr('pay.noEmployees')}>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><UserPlus size={16} /> {tr('pay.addEmployee')}</button>
        </EmptyState>
      ) : (
        <>
          {tab === '' && <TodayTab {...ctx} />}
          {tab === 'month' && <MonthTab {...ctx} />}
          {tab === 'salary' && <SalaryTab {...ctx} />}
          {tab === 'advances' && <AdvancesTab {...ctx} />}
          {tab === 'employees' && <EmployeesTab {...ctx} />}
        </>
      )}
      {editing && <EmployeeSheet emp={editing} onClose={() => setEditing(null)} reload={reload} />}
    </div>
  );
}

function useMonthAttendance(month) {
  const [att, setAtt] = useState(null);
  const load = useCallback(() => listAttendance(month).then(setAtt, () => { toast(tr('mod.loadError'), 'error'); setAtt([]); }), [month]);
  useEffect(() => { load(); }, [load]);
  return [att, setAtt];
}

function TodayTab({ active }) {
  const [date, setDate] = useState(todayISO());
  const month = monthOf(date);
  const [att, setAtt] = useMonthAttendance(month);
  const [busy, setBusy] = useState(false);
  const codeOf = (empId) => (att || []).find(a => a.empId === empId)?.days?.[date] || '';
  const mark = async (changes) => {
    setBusy(true);
    try { setAtt(await markAttendance(month, att || [], changes)); } catch (e) { console.warn(e); toast(tr('mod.saveError'), 'error'); }
    setBusy(false);
  };
  const counts = ATT_CODES.map(c => [c, active.filter(e => codeOf(e.id) === c).length]);
  return (
    <>
      <div className="mod-toolbar">
        <input type="date" className="form-input" value={date} max={todayISO()} onChange={e => setDate(e.target.value || todayISO())} aria-label={tr('pay.date')} />
        <button type="button" className="btn btn-secondary" disabled={busy || !att} data-testid="pay-all-present" onClick={() => mark(active.filter(e => !codeOf(e.id)).map(e => ({ empId: e.id, date, code: 'P' })))}><Check size={16} /> {tr('pay.allPresent')}</button>
      </div>
      <div className="mod-muted" style={{ marginBottom: 8, fontSize: '.85rem' }}>{counts.map(([c, n]) => `${tr(`pay.code_${c}`)}: ${n}`).join(' · ')}</div>
      {!att ? <div className="mod-card mod-muted">{tr('mod.loading')}</div> : (
        <div className="mod-list">
          {active.map(e => {
            const cur = codeOf(e.id);
            return (
              <div key={e.id} className="mod-row" style={{ flexDirection: 'column', alignItems: 'stretch' }} data-testid="pay-att-row">
                <div className="mod-row-title">{e.name}{e.role ? <span className="mod-muted" style={{ fontWeight: 400 }}> · {e.role}</span> : null}</div>
                <div className="mod-att" style={{ marginTop: 6 }}>
                  {ATT_CODES.map(c => (
                    <button type="button" key={c} className={cur === c ? `on-${c}` : ''} aria-pressed={cur === c} disabled={busy} title={tr(`pay.code_${c}`)}
                      onClick={() => mark([{ empId: e.id, date, code: cur === c ? null : c }])}>{tr(`pay.short_${c}`)}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function MonthTab({ active }) {
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [empId, setEmpId] = useState(active[0]?.id || '');
  const [att, setAtt] = useMonthAttendance(month);
  const rec = (att || []).find(a => a.empId === empId);
  const days = rec?.days || {};
  const dates = monthDates(month);
  const lead = new Date(`${month}-01T00:00:00`).getDay();
  const today = todayISO();
  const s = attendanceSummary(days, month, today);
  const cycle = async (d) => {
    try { setAtt(await markAttendance(month, att || [], [{ empId, date: d, code: NEXT[days[d] || ''] || null }])); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  return (
    <>
      <div className="mod-toolbar">
        <input type="month" className="form-input" value={month} max={monthOf(today)} onChange={e => setMonth(e.target.value || monthOf(today))} aria-label={tr('pay.month')} />
        <select className="form-input" value={empId} onChange={e => setEmpId(e.target.value)} aria-label={tr('pay.employee')}>
          {active.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="mod-muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>{tr('pay.tapToCycle')} · {ATT_CODES.map(c => `${tr(`pay.short_${c}`)} ${s[c]}`).join(' · ')}</div>
      {!att ? <div className="mod-card mod-muted">{tr('mod.loading')}</div> : (
        <div className="mod-card">
          <div className="mod-cal" data-testid="pay-cal">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <span key={i}>{w}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
            {dates.map(d => (
              <button type="button" key={d} className={days[d] ? `on-${days[d]}` : ''} disabled={d > today} onClick={() => cycle(d)}>
                <span style={{ minHeight: 0, fontSize: '.7rem' }}>{Number(d.slice(8))}</span><b>{days[d] ? tr(`pay.short_${days[d]}`) : '·'}</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

async function slipPdf({ profile, emp, calc, sal }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const ascii = (s) => String(s || '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '');
  const amt = (n) => `Rs. ${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let y = 14; const L = 10; const R = 138;
  doc.setFontSize(13); doc.text(ascii(profile?.businessName || ''), L, y); y += 5;
  doc.setFontSize(8); if (profile?.address) { doc.text(doc.splitTextToSize(ascii(profile.address), 128).slice(0, 2), L, y); y += 8; }
  doc.setFontSize(12); doc.text(`Salary slip - ${monthLabel(calc.month)}`, L, y); y += 7;
  doc.setFontSize(9);
  const kv = (k, v, bold) => { if (bold) doc.setFont(undefined, 'bold'); doc.text(ascii(k), L, y); doc.text(ascii(v), R, y, { align: 'right' }); if (bold) doc.setFont(undefined, 'normal'); y += 5.5; };
  kv('Employee', emp.name); if (emp.role) kv('Role', emp.role); if (emp.phone) kv('Phone', emp.phone);
  kv('Salary', `${amt(emp.salary)} / ${emp.salaryType === 'monthly' ? 'month' : emp.salaryType === 'daily' ? 'day' : 'hour'}`);
  y += 2; doc.line(L, y - 3, R, y - 3);
  const s = calc.summary;
  kv('Present / Half-day / Leave / Absent', `${s.P} / ${s.H} / ${s.L} / ${s.A}`);
  if (emp.salaryType === 'monthly') kv('Loss-of-pay days', String(calc.lopDays)); else if (emp.salaryType === 'hourly') kv('Hours', String(calc.hours)); else kv('Days paid', String(calc.worked));
  kv('Earned salary', amt(calc.base));
  if (calc.bonus) kv('Bonus', amt(calc.bonus));
  if (calc.overtime) kv('Overtime', amt(calc.overtime));
  kv('Gross pay', amt(calc.gross), true);
  if (calc.recovery) kv('Advance / loan recovery', `- ${amt(calc.recovery)}`);
  if (calc.otherDeduction) kv('Other deductions', `- ${amt(calc.otherDeduction)}`);
  doc.line(L, y - 3, R, y - 3);
  kv('Net pay', amt(calc.net), true);
  if (sal?.paidOn) kv('Paid on', `${sal.paidOn} (${sal.mode || ''})`);
  y += 10; doc.setFontSize(8); doc.text('Employer signature', R, y, { align: 'right' }); doc.text('Employee signature', L, y);
  return doc.output('blob');
}

function SalaryTab({ active, advances, salaries, reload, biz, profile }) {
  const [month, setMonth] = useState(() => { const t = todayISO(); return monthOf(t); });
  const [att] = useMonthAttendance(month);
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => active.map(e => {
    const sal = salaries.find(s => s.empId === e.id && s.month === month);
    const adj = sal?.adj || { recovery: suggestedRecovery(e.id, advances, salaries) };
    const calc = sal?.calc || calcSalary(e, (att || []).find(a => a.empId === e.id), month, adj);
    return { emp: e, sal, adj, calc };
  }), [active, salaries, advances, att, month]);
  const total = rows.reduce((s, r) => s + r.calc.net, 0);
  const paid = rows.filter(r => r.sal).reduce((s, r) => s + r.calc.net, 0);
  return (
    <>
      <div className="mod-toolbar">
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value || monthOf(todayISO()))} aria-label={tr('pay.month')} />
      </div>
      <div className="mod-grid" style={{ marginBottom: 10 }}>
        <div className="mod-stat"><span className="mod-muted">{tr('pay.totalNet')}</span><b>{formatCurrency(total)}</b></div>
        <div className="mod-stat"><span className="mod-muted">{tr('pay.paid')}</span><b style={{ color: '#16a34a' }}>{formatCurrency(paid)}</b></div>
        <div className="mod-stat"><span className="mod-muted">{tr('pay.pending')}</span><b style={{ color: '#b45309' }}>{formatCurrency(total - paid)}</b></div>
      </div>
      {!att ? <div className="mod-card mod-muted">{tr('mod.loading')}</div> : (
        <div className="mod-list">
          {rows.map(r => (
            <div key={r.emp.id} className="mod-row" role="button" tabIndex={0} style={{ cursor: 'pointer' }} data-testid="pay-salary-row" onClick={() => setOpen(r.emp.id)} onKeyDown={e => { if (e.key === 'Enter') setOpen(r.emp.id); }}>
              <div className="mod-row-main">
                <div className="mod-row-title">{r.emp.name}</div>
                <div className="mod-row-sub">{tr(`pay.type_${r.emp.salaryType}`)} · {ATT_CODES.filter(c => r.calc.summary[c]).map(c => `${tr(`pay.short_${c}`)} ${r.calc.summary[c]}`).join(' · ')}{r.calc.recovery ? ` · ${tr('pay.recovery')} ${formatCurrency(r.calc.recovery)}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mod-amt">{formatCurrency(r.calc.net)}</div>
                <span className={`mod-chip ${r.sal ? 'green' : 'amber'}`}>{r.sal ? tr('pay.paid') : tr('pay.pending')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && (() => {
        const r = rows.find(x => x.emp.id === open);
        return r ? <SalarySheet row={r} month={month} att={(att || []).find(a => a.empId === open)} advances={advances} salaries={salaries} biz={biz} profile={profile} reload={reload} onClose={() => setOpen(null)} /> : null;
      })()}
    </>
  );
}

function SalarySheet({ row, month, att, advances, salaries, biz, profile, reload, onClose }) {
  const { emp, sal } = row;
  const [adj, setAdj] = useState(() => ({ bonus: '', overtime: '', extraHours: '', otherDeduction: '', ...row.adj }));
  const [paidOn, setPaidOn] = useState(() => { const t = todayISO(); return t.startsWith(month) || t < month ? t : `${month}-${String(monthDates(month).length).padStart(2, '0')}`; });
  const [mode, setMode] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const calc = sal?.calc || calcSalary(emp, att, month, adj);
  const advBal = advanceBalance(emp.id, advances, salaries);
  const set = (k) => (e) => setAdj(a => ({ ...a, [k]: e.target.value }));
  const fileName = `Salary-${emp.name.replace(/[^\w]+/g, '_')}-${month}.pdf`;
  const pay = async () => {
    setBusy(true);
    try {
      const res = await markSalaryPaid({ biz, emp, calc, adj, paidOn, mode });
      toast(res.posted ? tr('pay.paidPosted') : tr('pay.paidNoBooks'), 'success');
      await reload();
    } catch (e) { console.warn(e); toast(tr('mod.saveError'), 'error'); }
    setBusy(false);
  };
  const undo = async () => {
    if (!(await confirmAction({ title: tr('pay.undoPaid'), message: `${emp.name} · ${monthLabel(month)}`, tone: 'danger', confirmLabel: tr('pay.undoPaid'), cancelLabel: tr('mod.cancel') }))) return;
    try { await undoSalaryPaid({ biz, empId: emp.id, month }); await reload(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  const pdf = async () => {
    const blob = await slipPdf({ profile, emp, calc, sal });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const share = async () => {
    const text = slipText({ emp, calc, business: profile?.businessName, monthLabel: monthLabel(month) });
    try {
      const blob = await slipPdf({ profile, emp, calc, sal });
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    openInNewTab(whatsAppUrl(emp.phone || '', text));
  };
  const line = (k, v, strong) => <tr><td>{strong ? <b>{k}</b> : k}</td><td style={{ textAlign: 'right' }}>{strong ? <b>{v}</b> : v}</td></tr>;
  return (
    <BottomSheet title={`${emp.name} · ${monthLabel(month)}`} onClose={onClose}>
      <table className="mod-table" data-testid="pay-calc"><tbody>
        {line(tr('pay.days'), `${tr('pay.short_P')} ${calc.summary.P} · ${tr('pay.short_H')} ${calc.summary.H} · ${tr('pay.short_L')} ${calc.summary.L} · ${tr('pay.short_A')} ${calc.summary.A}`)}
        {emp.salaryType === 'monthly' && line(tr('pay.lopDays'), calc.lopDays)}
        {emp.salaryType === 'hourly' && line(tr('pay.hours'), calc.hours)}
        {emp.salaryType === 'daily' && line(tr('pay.daysPaid'), calc.worked)}
        {line(tr('pay.earned'), formatCurrency(calc.base))}
        {calc.additions ? line(tr('pay.additions'), formatCurrency(calc.additions)) : null}
        {line(tr('pay.gross'), formatCurrency(calc.gross), true)}
        {calc.recovery ? line(tr('pay.recovery'), `− ${formatCurrency(calc.recovery)}`) : null}
        {calc.otherDeduction ? line(tr('pay.otherDeduction'), `− ${formatCurrency(calc.otherDeduction)}`) : null}
        {line(tr('pay.net'), formatCurrency(calc.net), true)}
      </tbody></table>
      {!sal ? (
        <>
          <div className="mod-form two" style={{ marginTop: 10 }}>
            <label>{tr('pay.bonus')}<input className="form-input" type="number" inputMode="decimal" min="0" value={adj.bonus} onChange={set('bonus')} /></label>
            <label>{tr('pay.overtime')}<input className="form-input" type="number" inputMode="decimal" min="0" value={adj.overtime} onChange={set('overtime')} /></label>
            {emp.salaryType === 'hourly' && <label>{tr('pay.extraHours')}<input className="form-input" type="number" inputMode="decimal" min="0" value={adj.extraHours} onChange={set('extraHours')} /></label>}
            <label>{tr('pay.recovery')} ({tr('pay.balance')} {formatCurrency(advBal)})<input className="form-input" type="number" inputMode="decimal" min="0" max={Math.max(0, advBal)} value={adj.recovery} onChange={set('recovery')} /></label>
            <label>{tr('pay.otherDeduction')}<input className="form-input" type="number" inputMode="decimal" min="0" value={adj.otherDeduction} onChange={set('otherDeduction')} /></label>
            <label>{tr('pay.paidOn')}<input className="form-input" type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></label>
            <label>{tr('pay.mode')}<select className="form-input" value={mode} onChange={e => setMode(e.target.value)}>{['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}</select></label>
          </div>
          <div className="mod-actions">
            <button type="button" className="btn btn-primary" disabled={busy || !paidOn} onClick={pay} data-testid="pay-mark-paid"><Check size={16} /> {busy ? tr('mod.saving') : tr('pay.markPaid')}</button>
          </div>
        </>
      ) : (
        <p className="mod-muted" style={{ marginTop: 8 }}>{tr('pay.paidOnInfo', { date: sal.paidOn, mode: sal.mode || '' })}</p>
      )}
      <div className="mod-actions">
        <button type="button" className="btn btn-secondary" onClick={pdf} data-testid="pay-slip-pdf"><Download size={16} /> {tr('pay.slipPdf')}</button>
        <button type="button" className="btn btn-secondary" onClick={share}><MessageCircle size={16} /> WhatsApp</button>
        {sal && <button type="button" className="btn btn-secondary" onClick={undo}><RotateCcw size={16} /> {tr('pay.undoPaid')}</button>}
      </div>
    </BottomSheet>
  );
}

function AdvancesTab({ active, emps, advances, salaries, reload, biz }) {
  const [form, setForm] = useState(null);
  const name = (id) => emps.find(e => e.id === id)?.name || '';
  const save = async () => {
    const amount = Number(form.amount);
    if (!form.empId || !(amount > 0)) { toast(tr('pay.errAdvance'), 'warning'); return; }
    try {
      const emp = emps.find(e => e.id === form.empId);
      const res = await saveAdvance({ empId: form.empId, date: form.date, amount, kind: form.kind, installment: form.kind === 'loan' ? Number(form.installment) || 0 : 0, mode: form.mode, note: String(form.note || '').slice(0, 200) }, { biz, emp });
      toast(res.posted ? tr('pay.advPosted') : tr('pay.saved'), 'success'); setForm(null); reload();
    } catch { toast(tr('mod.saveError'), 'error'); }
  };
  const remove = async (a) => {
    if (!(await confirmAction({ title: tr('pay.deleteAdvance'), message: `${name(a.empId)} · ${formatCurrency(a.amount)}`, tone: 'danger', confirmLabel: tr('mod.delete'), cancelLabel: tr('mod.cancel') }))) return;
    try { await deleteAdvance(a, { biz }); reload(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  return (
    <>
      <div className="mod-grid" style={{ marginBottom: 10 }}>
        {active.filter(e => advanceBalance(e.id, advances, salaries) > 0).map(e => (
          <div key={e.id} className="mod-stat"><span className="mod-muted">{e.name}</span><b>{formatCurrency(advanceBalance(e.id, advances, salaries))}</b></div>
        ))}
      </div>
      {!form ? (
        <div className="mod-actions" style={{ marginTop: 0 }}><button type="button" className="btn btn-primary" data-testid="pay-add-advance" onClick={() => setForm({ empId: active[0]?.id || '', date: todayISO(), amount: '', kind: 'advance', installment: '', mode: 'Cash', note: '' })}><HandCoins size={16} /> {tr('pay.giveAdvance')}</button></div>
      ) : (
        <div className="mod-card mod-form two">
          <label>{tr('pay.employee')}<select className="form-input" value={form.empId} onChange={e => setForm(f => ({ ...f, empId: e.target.value }))}>{active.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label>{tr('pay.kind')}<select className="form-input" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}><option value="advance">{tr('pay.advance')}</option><option value="loan">{tr('pay.loan')}</option></select></label>
          <label>{tr('pay.amount')}<input className="form-input" type="number" inputMode="decimal" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></label>
          {form.kind === 'loan' && <label>{tr('pay.installment')}<input className="form-input" type="number" inputMode="decimal" min="0" value={form.installment} onChange={e => setForm(f => ({ ...f, installment: e.target.value }))} /></label>}
          <label>{tr('pay.date')}<input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></label>
          <label>{tr('pay.mode')}<select className="form-input" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>{['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}</select></label>
          <label>{tr('pay.note')}<input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} maxLength={200} /></label>
          <div className="mod-actions"><button type="button" className="btn btn-primary" onClick={save}>{tr('pay.save')}</button><button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>{tr('mod.cancel')}</button></div>
        </div>
      )}
      {!advances.length ? <EmptyState icon={HandCoins} text={tr('pay.noAdvances')} /> : (
        <div className="mod-list">
          {[...advances].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(a => (
            <div key={a.id} className="mod-row" data-testid="pay-advance">
              <div className="mod-row-main"><div className="mod-row-title">{name(a.empId)}</div><div className="mod-row-sub">{fmtDay(a.date)} · {a.kind === 'loan' ? `${tr('pay.loan')} (${tr('pay.installment')} ${formatCurrency(a.installment)})` : tr('pay.advance')}{a.note ? ` · ${a.note}` : ''}</div></div>
              <div className="mod-amt">{formatCurrency(a.amount)}</div>
              <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={() => remove(a)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EmployeesTab({ emps, setEditing }) {
  return (
    <>
      <div className="mod-actions" style={{ marginTop: 0 }}><button type="button" className="btn btn-primary" onClick={() => setEditing({})} data-testid="pay-add-emp"><UserPlus size={16} /> {tr('pay.addEmployee')}</button></div>
      {!emps.length ? <EmptyState icon={Users2} text={tr('pay.noEmployees')} /> : (
        <div className="mod-list">
          {emps.map(e => (
            <div key={e.id} className="mod-row" role="button" tabIndex={0} style={{ cursor: 'pointer', opacity: e.active === false ? 0.55 : 1 }} data-testid="pay-emp" onClick={() => setEditing(e)} onKeyDown={ev => { if (ev.key === 'Enter') setEditing(e); }}>
              <div className="mod-row-main"><div className="mod-row-title">{e.name}</div><div className="mod-row-sub">{e.role || '—'} · {formatCurrency(e.salary)} / {tr(`pay.per_${e.salaryType}`)}{e.active === false ? ` · ${tr('pay.inactive')}` : ''}</div></div>
              {e.phone ? <a className="mod-icon-btn call" href={`tel:${e.phone}`} onClick={ev => ev.stopPropagation()} aria-label={tr('mod.call')}><Phone size={18} /></a> : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EmployeeSheet({ emp, onClose, reload }) {
  const [f, setF] = useState(() => ({ salaryType: 'monthly', hoursPerDay: 8, paidLeaves: 0, active: true, joinDate: todayISO(), ...emp }));
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    let clean;
    try { clean = cleanEmployee(f); } catch (e) { toast(tr(e.message === 'need_name' ? 'pay.errName' : 'pay.errSalary'), 'warning'); return; }
    try { await saveEmployee(clean); toast(tr('pay.saved'), 'success'); await reload(); onClose(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  const remove = async () => {
    if (!(await confirmAction({ title: tr('pay.deleteEmployee'), message: tr('pay.deleteEmployeeMsg', { name: f.name }), tone: 'danger', confirmLabel: tr('mod.delete'), cancelLabel: tr('mod.cancel') }))) return;
    try { await deleteEmployee(f.id); await reload(); onClose(); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  return (
    <BottomSheet title={f.id ? f.name : tr('pay.addEmployee')} onClose={onClose}>
      <div className="mod-form two">
        <label>{tr('pay.name')}<input className="form-input" value={f.name || ''} onChange={set('name')} maxLength={100} autoFocus={!f.id} /></label>
        <label>{tr('pay.phone')}<input className="form-input" type="tel" inputMode="tel" value={f.phone || ''} onChange={set('phone')} maxLength={16} /></label>
        <label>{tr('pay.role')}<input className="form-input" value={f.role || ''} onChange={set('role')} maxLength={60} /></label>
        <label>{tr('pay.salaryType')}<select className="form-input" value={f.salaryType} onChange={set('salaryType')}>{SALARY_TYPES.map(s => <option key={s} value={s}>{tr(`pay.type_${s}`)}</option>)}</select></label>
        <label>{tr('pay.salaryAmount', { per: tr(`pay.per_${f.salaryType}`) })}<input className="form-input" type="number" inputMode="decimal" min="0" value={f.salary ?? ''} onChange={set('salary')} /></label>
        {f.salaryType === 'hourly' && <label>{tr('pay.hoursPerDay')}<input className="form-input" type="number" inputMode="decimal" min="1" max="24" value={f.hoursPerDay} onChange={set('hoursPerDay')} /></label>}
        <label>{tr('pay.paidLeaves')}<input className="form-input" type="number" inputMode="numeric" min="0" max="31" value={f.paidLeaves} onChange={set('paidLeaves')} /></label>
        <label>{tr('pay.joinDate')}<input className="form-input" type="date" value={f.joinDate || ''} onChange={set('joinDate')} /></label>
      </div>
      <label className="mod-switch" style={{ marginTop: 10 }}><input type="checkbox" checked={f.active !== false} onChange={set('active')} /> {tr('pay.activeLabel')}</label>
      <div className="mod-actions">
        <button type="button" className="btn btn-primary" onClick={save} data-testid="pay-save-emp">{tr('pay.save')}</button>
        {f.id && <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={remove}><Trash2 size={18} /></button>}
      </div>
    </BottomSheet>
  );
}
