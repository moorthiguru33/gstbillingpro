import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bluetooth, Usb, Printer } from 'lucide-react';
import { toast } from '../Toast';
import { LANGUAGES } from '../../i18n';
import { hasBluetooth, hasUsb, savedPrinter, savePrinterSettings, pairBluetooth, pairUsb, forgetPrinter, sendBytes } from '../../utils/thermalPrinter';
import { testPageBytes } from '../../utils/escpos';
import { customerLang, setCustomerLang } from '../../lib/billLink';

// Settings > Bills & Printing: pair a Bluetooth/USB receipt printer and pick
// the language of WhatsApp messages to customers.
export default function PrinterPanel({ businessName = '' }) {
  const { t } = useTranslation();
  const [printer, setPrinter] = useState(savedPrinter);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState(customerLang);
  const paper = printer?.paper || 80;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) {
      if (e?.name !== 'NotFoundError') toast(`${t('printer.failed')}: ${e?.message || e}`, 'error', 6000);
    } finally { setBusy(false); }
  };
  const pair = (kind) => run(async () => {
    const p = kind === 'usb' ? await pairUsb(paper) : await pairBluetooth(paper);
    setPrinter(p); toast(t('printer.paired', { name: p.name }), 'success');
  });
  const test = () => run(async () => { await sendBytes(testPageBytes(paper, businessName)); toast(t('printer.testSent'), 'success'); });
  const setPaper = (mm) => setPrinter(savePrinterSettings({ paper: mm }));
  const supported = hasBluetooth() || hasUsb();

  return (
    <div className="glass-panel p-6 mb-6" id="section-printer">
      <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Printer size={18} /> {t('printer.title')}</h3>
      <p className="settings-help">{t('printer.help')}</p>
      {!supported && <p className="settings-note">{t('printer.unsupported')}</p>}
      <div className="settings-row">
        <span>{t('printer.paper')}</span>
        <div className="seg">
          {[58, 80].map(mm => (
            <button key={mm} type="button" className={paper === mm ? 'on' : ''} onClick={() => setPaper(mm)}>{mm} mm</button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <span>{t('printer.current')}</span>
        <strong>{printer?.kind ? `${printer.name} (${printer.kind === 'usb' ? 'USB' : 'Bluetooth'})` : t('printer.none')}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {hasBluetooth() && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => pair('bt')}><Bluetooth size={16} /> {t('printer.pairBt')}</button>}
        {hasUsb() && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => pair('usb')}><Usb size={16} /> {t('printer.pairUsb')}</button>}
        {printer?.kind && <button type="button" className="btn btn-primary" disabled={busy} onClick={test}>{t('printer.test')}</button>}
        {printer?.kind && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { forgetPrinter(); setPrinter(null); }}>{t('printer.forget')}</button>}
      </div>
      <p className="settings-help" style={{ marginTop: 10 }}>{t('printer.fallback')}</p>

      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />
      <h3 className="section-title">{t('share.customerLangTitle')}</h3>
      <p className="settings-help">{t('share.customerLangHelp')}</p>
      <select value={lang} onChange={e => { setLang(e.target.value); setCustomerLang(e.target.value); }} className="form-input" style={{ maxWidth: 280 }}>
        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.native} · {l.english}</option>)}
      </select>
    </div>
  );
}
