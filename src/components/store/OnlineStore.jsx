import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Store, ShoppingBag, Package, Share2, Settings as Cog, Phone, MessageCircle, FileText, Check, X,
  Copy, ExternalLink, Download, Camera, Eye, EyeOff, Search, RefreshCw, Trash2,
} from 'lucide-react';
import PageHeader from '../PageHeader';
import ModuleGate, { ModuleTabs, EmptyState } from '../modules/ModuleGate';
import { toast } from '../Toast';
import { confirmAction } from '../ConfirmModal';
import { t as tr, LANGUAGES, currentLanguage } from '../../i18n';
import { formatCurrency } from '../../utils';
import { openInNewTab, whatsAppUrl } from '../../utils/share';
import { getProfile, getAllProducts } from '../../store-supabase';
import { roleCan } from '../../lib/org';
import { PUBLIC_ORIGIN } from '../../lib/appLinks';
import { getShop, saveShop, listOrders, setOrderStatus, deleteOrder, uploadStoreImage, slugAvailable } from '../../lib/storeData';
import { slugify, isValidSlug, orderToBillDraft, SHOP_LANGS } from '../../../shared/store.js';

const STATUS_CHIP = { new: 'amber', confirmed: '', invoiced: 'green', cancelled: 'red' };
const when = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function OnlineStore(props) {
  return (
    <ModuleGate module="onlineStore" tables={['store_shops', 'store_orders']} title={tr('shop.title')} icon={<Store size={22} />}>
      <StoreScreen {...props} />
    </ModuleGate>
  );
}

function StoreScreen({ sub, onSub, onConvertOrder }) {
  const canManage = roleCan('settings');
  const [shop, setShop] = useState(undefined);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const tab = ['products', 'share', 'settings'].includes(sub) ? sub : '';

  const reload = useCallback(() => Promise.all([getShop(), listOrders(), getAllProducts()]).then(([s, o, p]) => {
    setShop(s); setOrders(o); setProducts(p || []); setLoading(false);
  }, (e) => { console.warn(e); toast(tr('mod.loadError'), 'error'); setLoading(false); }), []);
  useEffect(() => { reload(); }, [reload]);

  const newCount = orders.filter(o => o.status === 'new').length;
  const tabs = [
    { id: '', label: tr('shop.tabOrders'), icon: ShoppingBag, badge: newCount || null },
    ...(canManage ? [
      { id: 'products', label: tr('shop.tabProducts'), icon: Package },
      { id: 'share', label: tr('shop.tabShare'), icon: Share2 },
      { id: 'settings', label: tr('shop.tabSettings'), icon: Cog },
    ] : []),
  ];
  const shopUrl = shop?.slug ? `${PUBLIC_ORIGIN}/s/${shop.slug}` : '';

  return (
    <div className="mod-page">
      <PageHeader icon={<Store size={20} />} title={tr('shop.title')} subtitle={tr('shop.subtitle')} meta={shop?.enabled ? tr('shop.live') : null}>
        <button type="button" className="mod-icon-btn" onClick={() => { setLoading(true); reload(); }} aria-label={tr('mod.refresh')}><RefreshCw size={18} /></button>
      </PageHeader>
      <ModuleTabs tabs={tabs} active={tab} onChange={onSub} />
      {loading ? <div className="mod-card mod-muted">{tr('mod.loading')}</div> : (
        <>
          {!shop && canManage && tab !== 'settings' && (
            <div className="mod-card mod-center">
              <div className="mod-badge"><Store size={22} /></div>
              <h2>{tr('shop.createTitle')}</h2>
              <p className="mod-muted">{tr('shop.createBody')}</p>
              <button type="button" className="btn btn-primary" onClick={() => onSub('settings')}>{tr('shop.createCta')}</button>
            </div>
          )}
          {tab === '' && <OrdersTab orders={orders} setOrders={setOrders} products={products} onConvertOrder={onConvertOrder} shop={shop} />}
          {tab === 'products' && shop && <ProductsTab shop={shop} setShop={setShop} products={products} />}
          {tab === 'share' && shop && <ShareTab shop={shop} setShop={setShop} url={shopUrl} />}
          {tab === 'settings' && <SettingsTab shop={shop} setShop={setShop} onDone={() => onSub('share')} />}
        </>
      )}
    </div>
  );
}

function OrdersTab({ orders, setOrders, products, onConvertOrder, shop }) {
  const [filter, setFilter] = useState('open');
  const list = orders.filter(o => (filter === 'open' ? ['new', 'confirmed'].includes(o.status) : filter === 'all' ? true : o.status === filter));
  const update = async (o, status, billId) => {
    try {
      await setOrderStatus(o.id, status, billId);
      setOrders(prev => prev.map(x => (x.id === o.id ? { ...x, status, ...(billId ? { bill_id: billId } : {}) } : x)));
    } catch (e) { console.warn(e); toast(tr('mod.saveError'), 'error'); }
  };
  const remove = async (o) => {
    if (!(await confirmAction({ title: tr('shop.deleteOrder'), message: o.order_no, tone: 'danger', confirmLabel: tr('mod.delete'), cancelLabel: tr('mod.cancel') }))) return;
    try { await deleteOrder(o.id); setOrders(prev => prev.filter(x => x.id !== o.id)); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  const convert = async (o) => {
    await update(o, 'invoiced');
    onConvertOrder?.(orderToBillDraft(o, products));
  };
  const confirmMsg = (o) => tr('shop.confirmMsg', { name: o.customer_name, no: o.order_no, amount: formatCurrency(o.total), shop: shop?.data?.name || '' });
  return (
    <>
      <div className="mod-toolbar">
        <select className="form-input" value={filter} onChange={e => setFilter(e.target.value)} aria-label={tr('shop.filter')}>
          <option value="open">{tr('shop.fOpen')}</option>
          <option value="new">{tr('shop.st_new')}</option>
          <option value="confirmed">{tr('shop.st_confirmed')}</option>
          <option value="invoiced">{tr('shop.st_invoiced')}</option>
          <option value="cancelled">{tr('shop.st_cancelled')}</option>
          <option value="all">{tr('shop.fAll')}</option>
        </select>
      </div>
      {!list.length ? <EmptyState icon={ShoppingBag} text={tr('shop.noOrders')} /> : (
        <div className="mod-list">
          {list.map(o => (
            <div key={o.id} className="mod-card" data-testid="online-order" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="mod-row-title">{o.customer_name}</div>
                  <div className="mod-row-sub">{o.order_no} · {when(o.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mod-amt">{formatCurrency(o.total)}</div>
                  <span className={`mod-chip ${STATUS_CHIP[o.status] || ''}`}>{tr(`shop.st_${o.status}`)}</span>
                </div>
              </div>
              <div className="mod-row-sub" style={{ marginTop: 6 }}>
                {(o.data?.items || []).map(i => `${i.name} × ${i.qty}`).join(', ')}
              </div>
              {o.data?.address ? <div className="mod-row-sub">📍 {o.data.address}</div> : null}
              {o.data?.note ? <div className="mod-row-sub">📝 {o.data.note}</div> : null}
              <div className="mod-actions">
                <a className="mod-icon-btn call" href={`tel:+${o.customer_phone}`} aria-label={tr('mod.call')}><Phone size={18} /></a>
                <button type="button" className="mod-icon-btn wa" aria-label="WhatsApp" onClick={() => openInNewTab(whatsAppUrl(o.customer_phone, confirmMsg(o)))}><MessageCircle size={18} /></button>
                {o.status === 'new' && <button type="button" className="btn btn-secondary" onClick={() => update(o, 'confirmed')}><Check size={16} /> {tr('shop.confirm')}</button>}
                {['new', 'confirmed'].includes(o.status) && roleCan('write') && <button type="button" className="btn btn-primary" onClick={() => convert(o)}><FileText size={16} /> {tr('shop.toInvoice')}</button>}
                {['new', 'confirmed'].includes(o.status) && <button type="button" className="mod-icon-btn" aria-label={tr('shop.cancelOrder')} onClick={() => update(o, 'cancelled')}><X size={18} /></button>}
                {roleCan('delete') && ['cancelled', 'invoiced'].includes(o.status) && <button type="button" className="mod-icon-btn" aria-label={tr('mod.delete')} onClick={() => remove(o)}><Trash2 size={18} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProductsTab({ shop, setShop, products }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const cfg = shop.data?.products || {};
  const list = useMemo(() => products.filter(p => !q || String(p.name || '').toLowerCase().includes(q.toLowerCase())), [products, q]);
  const shown = products.filter(p => !cfg[p.id]?.hidden).length;
  const persist = async (nextCfg) => {
    const next = { ...shop, data: { ...shop.data, products: nextCfg } };
    setShop(next);
    try { await saveShop(next); } catch (e) { console.warn(e); toast(tr('mod.saveError'), 'error'); }
  };
  const toggle = (p) => persist({ ...cfg, [p.id]: { ...cfg[p.id], hidden: !cfg[p.id]?.hidden } });
  const setAll = (hidden) => persist(Object.fromEntries(products.map(p => [p.id, { ...cfg[p.id], hidden }])));
  const photo = async (p, file) => {
    if (!file) return;
    setBusy(p.id);
    try {
      const url = await uploadStoreImage(file, `p_${p.id}`);
      await persist({ ...cfg, [p.id]: { ...cfg[p.id], image: url } });
      toast(tr('shop.photoSaved'), 'success');
    } catch (e) { console.warn(e); toast(tr('shop.photoFailed'), 'error'); }
    setBusy('');
  };
  return (
    <>
      <div className="mod-toolbar">
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 12, opacity: 0.5 }} />
          <input className="form-input" style={{ paddingLeft: 32, width: '100%' }} value={q} onChange={e => setQ(e.target.value)} placeholder={tr('shop.searchProducts')} />
        </div>
        <span className="mod-muted">{tr('shop.shownCount', { shown, total: products.length })}</span>
      </div>
      <div className="mod-actions" style={{ marginTop: 0, marginBottom: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setAll(false)}><Eye size={16} /> {tr('shop.showAll')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setAll(true)}><EyeOff size={16} /> {tr('shop.hideAll')}</button>
      </div>
      {!list.length ? <EmptyState icon={Package} text={tr('shop.noProducts')} /> : (
        <div className="mod-list">
          {list.map(p => {
            const c = cfg[p.id] || {};
            const stock = p.stock;
            const tracked = stock !== null && stock !== undefined && stock !== '';
            return (
              <div key={p.id} className="mod-row" style={{ opacity: c.hidden ? 0.55 : 1 }}>
                <label className="mod-thumb" style={{ cursor: 'pointer', overflow: 'hidden' }} title={tr('shop.addPhoto')}>
                  {c.image ? <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (busy === p.id ? '…' : <Camera size={20} />)}
                  <input type="file" accept="image/*" hidden onChange={e => photo(p, e.target.files?.[0])} />
                </label>
                <div className="mod-row-main">
                  <div className="mod-row-title">{p.name}</div>
                  <div className="mod-row-sub">{formatCurrency(p.sellingPrice ?? p.price ?? 0)}{p.category ? ` · ${p.category}` : ''} · {tracked ? (Number(stock) > 0 ? tr('shop.inStock', { n: stock }) : tr('shop.outOfStock')) : tr('shop.stockNotTracked')}</div>
                </div>
                <label className="mod-switch" aria-label={tr('shop.visible')}>
                  <input type="checkbox" checked={!c.hidden} onChange={() => toggle(p)} />
                </label>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ShareTab({ shop, setShop, url }) {
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { width: 600, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr('')); }, [url]);
  const name = shop.data?.name || '';
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast(tr('shop.copied'), 'success'); } catch { toast(url, 'info', 8000); } };
  const toggle = async () => {
    const next = { ...shop, enabled: !shop.enabled };
    try { setShop(await saveShop(next) || next); } catch { toast(tr('mod.saveError'), 'error'); }
  };
  const poster = async () => {
    const W = 1240; const H = 1754;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, W, 520); grad.addColorStop(0, '#1d4ed8'); grad.addColorStop(1, '#2563eb');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = grad; g.fillRect(0, 0, W, 520);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = 'bold 76px system-ui, sans-serif'; wrapText(g, name, W / 2, 200, W - 160, 88);
    g.font = '600 52px system-ui, sans-serif'; g.fillText(tr('shop.posterOrder'), W / 2, 430);
    const img = new Image(); img.src = await QRCode.toDataURL(url, { width: 760, margin: 2, errorCorrectionLevel: 'M' });
    await new Promise(r => { img.onload = r; img.onerror = r; });
    g.drawImage(img, (W - 760) / 2, 600, 760, 760);
    g.fillStyle = '#0f172a'; g.font = '600 46px system-ui, sans-serif'; g.fillText(tr('shop.posterScan'), W / 2, 1450);
    g.fillStyle = '#1d4ed8'; g.font = 'bold 40px system-ui, sans-serif'; g.fillText(url.replace(/^https:\/\//, ''), W / 2, 1530);
    g.fillStyle = '#64748b'; g.font = '32px system-ui, sans-serif';
    if (shop.data?.whatsapp) g.fillText(`WhatsApp: ${shop.data.whatsapp}`, W / 2, 1610);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${shop.slug}-qr-poster.png`; a.click();
  };
  return (
    <div className="mod-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label className="mod-switch"><input type="checkbox" checked={!!shop.enabled} onChange={toggle} /> {shop.enabled ? tr('shop.live') : tr('shop.offline')}</label>
      </div>
      <p className="mod-muted" style={{ marginBottom: 6 }}>{tr('shop.yourLink')}</p>
      <div style={{ fontWeight: 800, wordBreak: 'break-all' }} data-testid="shop-url">{url}</div>
      <div className="mod-actions">
        <button type="button" className="btn btn-secondary" onClick={copy}><Copy size={16} /> {tr('shop.copy')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => openInNewTab(url)}><ExternalLink size={16} /> {tr('shop.open')}</button>
        <button type="button" className="btn btn-primary" onClick={() => openInNewTab(whatsAppUrl('', tr('shop.shareMsg', { name, url })))}><MessageCircle size={16} /> {tr('shop.shareWa')}</button>
      </div>
      {qr && <div style={{ textAlign: 'center', marginTop: 14 }}><img src={qr} alt="QR" style={{ width: 220, maxWidth: '70%', borderRadius: 12, border: '1px solid var(--border)' }} /></div>}
      <div className="mod-actions" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={poster}><Download size={16} /> {tr('shop.poster')}</button>
      </div>
    </div>
  );
}

function wrapText(g, text, x, y, maxW, lh) {
  const words = String(text || '').split(/\s+/); let line = ''; let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = test;
  }
  if (line) g.fillText(line, x, yy);
}

function SettingsTab({ shop, setShop, onDone }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      if (shop) { setForm({ slug: shop.slug, enabled: shop.enabled, ...shop.data }); return; }
      const p = await getProfile().catch(() => ({}));
      if (!alive) return;
      setForm({
        slug: slugify(p?.businessName) || '', enabled: true, name: p?.businessName || '', tagline: '',
        whatsapp: p?.phone || '', phone: p?.phone || '', upi: p?.upiId || '',
        address: [p?.address, p?.city].filter(Boolean).join(', '), city: p?.city || '',
        lang: SHOP_LANGS.includes(currentLanguage()) ? currentLanguage() : 'en', logo: /^https:\/\//.test(p?.logo || '') ? p.logo : '', showOutOfStock: true, products: {},
      });
    })();
    return () => { alive = false; };
  }, [shop]);
  if (!form) return <div className="mod-card mod-muted">{tr('mod.loading')}</div>;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    setErr('');
    const slug = String(form.slug || '').trim().toLowerCase();
    if (!isValidSlug(slug)) { setErr(tr('shop.errSlug')); return; }
    if (!form.name?.trim()) { setErr(tr('shop.errName')); return; }
    if (String(form.whatsapp || '').replace(/\D/g, '').length < 10) { setErr(tr('shop.errWa')); return; }
    setSaving(true);
    try {
      if ((await slugAvailable(slug)) === false) { setErr(tr('shop.errTaken')); setSaving(false); return; }
      const data = { ...form, name: form.name.trim() };
      delete data.slug; delete data.enabled;
      const saved = await saveShop({ slug, enabled: form.enabled !== false, data });
      setShop(saved);
      toast(tr('shop.saved'), 'success');
      if (!shop) onDone();
    } catch (e) {
      setErr(e?.message === 'slug_taken' ? tr('shop.errTaken') : tr('mod.saveError'));
    }
    setSaving(false);
  };
  const logo = async (file) => {
    if (!file) return;
    try { set('logo', await uploadStoreImage(file, 'logo')); } catch { toast(tr('shop.photoFailed'), 'error'); }
  };
  return (
    <div className="mod-card">
      {!shop && <p className="mod-muted" style={{ marginTop: 0 }}>{tr('shop.createBody')}</p>}
      <div className="mod-form two">
        <label>{tr('shop.slug')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="mod-muted" style={{ whiteSpace: 'nowrap' }}>/s/</span>
            <input className="form-input" value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={40} placeholder="my-shop" />
          </div>
        </label>
        <label>{tr('shop.name')}<input className="form-input" value={form.name || ''} onChange={e => set('name', e.target.value)} maxLength={100} /></label>
        <label>{tr('shop.tagline')}<input className="form-input" value={form.tagline || ''} onChange={e => set('tagline', e.target.value)} maxLength={160} /></label>
        <label>{tr('shop.whatsapp')}<input className="form-input" type="tel" inputMode="tel" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} maxLength={16} /></label>
        <label>{tr('shop.phone')}<input className="form-input" type="tel" inputMode="tel" value={form.phone || ''} onChange={e => set('phone', e.target.value)} maxLength={16} /></label>
        <label>{tr('shop.upi')}<input className="form-input" value={form.upi || ''} onChange={e => set('upi', e.target.value.trim())} maxLength={80} placeholder="name@upi" /></label>
        <label>{tr('shop.address')}<textarea className="form-input" rows={2} value={form.address || ''} onChange={e => set('address', e.target.value)} maxLength={300} /></label>
        <label>{tr('shop.city')}<input className="form-input" value={form.city || ''} onChange={e => set('city', e.target.value)} maxLength={60} /></label>
        <label>{tr('shop.lang')}
          <select className="form-input" value={form.lang || 'en'} onChange={e => set('lang', e.target.value)}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
        </label>
        <label>{tr('shop.logo')}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {form.logo ? <img src={form.logo} alt="" className="mod-thumb" /> : null}
            <input type="file" accept="image/*" onChange={e => logo(e.target.files?.[0])} />
          </div>
        </label>
      </div>
      <div className="mod-actions">
        <label className="mod-switch"><input type="checkbox" checked={form.showOutOfStock !== false} onChange={e => set('showOutOfStock', e.target.checked)} /> {tr('shop.showOos')}</label>
        <label className="mod-switch"><input type="checkbox" checked={form.enabled !== false} onChange={e => set('enabled', e.target.checked)} /> {tr('shop.enabled')}</label>
      </div>
      {err && <p role="alert" style={{ color: '#dc2626', fontWeight: 600 }}>{err}</p>}
      <div className="mod-actions"><button type="button" className="btn btn-primary" disabled={saving} onClick={save}>{saving ? tr('mod.saving') : tr('shop.save')}</button></div>
    </div>
  );
}
