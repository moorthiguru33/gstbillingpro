// Online Store + module gating unit tests (part of npm run test:unit).
import assert from 'node:assert/strict';
import {
  slugify, isValidSlug, buildCatalogue, validateOrder, rateLimitOk, makeOrderNo, orderMessage,
  renderShopPage, publicShop, orderToBillDraft, ORDER_LIMITS, SHOP_T,
} from '../shared/store.js';
import { moduleAllowed, MODULES } from '../shared/modules.js';
import { pathToRoute, routeToPath } from '../src/lib/appRouter.js';

let groups = 0;
const group = (name, fn) => { fn(); groups++; };

group('module gating', () => {
  assert.equal(moduleAllowed('free', 'onlineStore'), false);
  assert.equal(moduleAllowed('starter', 'onlineStore'), true);
  assert.equal(moduleAllowed('starter', 'crm'), true);
  assert.equal(moduleAllowed('starter', 'accounting'), false);
  assert.equal(moduleAllowed('pro', 'accounting'), true);
  assert.equal(moduleAllowed('pro', 'payroll'), true);
  assert.equal(moduleAllowed('business', 'payroll'), true);
  assert.equal(moduleAllowed('pro', 'nope'), false);
  assert.equal(Object.keys(MODULES).length, 4);
});

group('router sub pages', () => {
  assert.deepEqual(pathToRoute('/app/store'), { view: 'store', sub: '' });
  assert.deepEqual(pathToRoute('/app/store/products'), { view: 'store', sub: 'products' });
  assert.equal(routeToPath({ view: 'store', sub: 'share' }), '/app/store/share');
  assert.equal(pathToRoute('/app/pos/x'), null);
  assert.deepEqual(pathToRoute('/app/settings/printing'), { view: 'settings', sub: 'printing' });
});

group('slugs', () => {
  assert.equal(slugify('Sri Murugan Stores!'), 'sri-murugan-stores');
  assert.equal(slugify('A & B Traders'), 'a-and-b-traders');
  assert.equal(slugify('கடை'), '');
  assert.equal(isValidSlug('my-shop'), true);
  assert.equal(isValidSlug('-bad'), false);
  assert.equal(isValidSlug('ab'), false);
  assert.equal(isValidSlug('admin'), false);
  assert.equal(isValidSlug('Upper'), false);
});

const products = [
  { id: 'p1', name: 'Rice 5kg', price: 450, stock: 10, unit: 'BAG', data: { category: 'Grocery', mrp: 520 } },
  { id: 'p2', name: 'Oil 1L', price: 135, stock: 0, unit: 'PKT', data: { category: 'Oils' } },
  { id: 'p3', name: 'Soap', price: 40, stock: null, unit: 'PCS', data: {} },
  { id: 'p4', name: 'Hidden', price: 10, stock: 5, data: {} },
  { id: 'p5', name: 'Free sample', price: 0, stock: 5, data: {} },
];
const shopCfg = { products: { p4: { hidden: true }, p1: { image: 'https://x.supabase.co/a.jpg' }, p3: { image: 'javascript:alert(1)' } } };

group('catalogue', () => {
  const c = buildCatalogue(products, shopCfg);
  assert.deepEqual(c.items.map(i => i.id).sort(), ['p1', 'p2', 'p3']);
  const rice = c.items.find(i => i.id === 'p1');
  assert.equal(rice.mrp, 520); assert.equal(rice.image, 'https://x.supabase.co/a.jpg'); assert.equal(rice.inStock, true);
  assert.equal(c.items.find(i => i.id === 'p2').inStock, false);
  assert.equal(c.items.find(i => i.id === 'p3').inStock, true);
  assert.equal(c.items.find(i => i.id === 'p3').image, '');
  assert.deepEqual(c.categories, ['Grocery', 'Oils']);
  const c2 = buildCatalogue(products, { ...shopCfg, showOutOfStock: false });
  assert.equal(c2.items.some(i => i.id === 'p2'), false);
  const c3 = buildCatalogue(products, { visibility: 'selected', products: { p3: { shown: true } } });
  assert.deepEqual(c3.items.map(i => i.id), ['p3']);
});

group('order validation (server prices, limits)', () => {
  const cat = buildCatalogue(products, shopCfg);
  const ok = validateOrder({ name: ' Lakshmi ', phone: '98400 11223', items: [{ id: 'p1', qty: 2, price: 1 }, { id: 'p3', qty: 1 }, { id: 'p1', qty: 1 }] }, cat);
  assert.equal(ok.ok, true);
  assert.equal(ok.order.name, 'Lakshmi');
  assert.equal(ok.order.phone, '919840011223');
  assert.deepEqual(ok.order.items.map(i => [i.id, i.qty, i.amount]), [['p1', 3, 1350], ['p3', 1, 40]]);
  assert.equal(ok.order.total, 1390);
  const code = (b) => validateOrder(b, cat).code;
  assert.equal(code({ name: '', phone: '9840011223', items: [{ id: 'p1', qty: 1 }] }), 'need_name');
  assert.equal(code({ name: 'A', phone: '123', items: [{ id: 'p1', qty: 1 }] }), 'need_phone');
  assert.equal(code({ name: 'A', phone: '9840011223', items: [] }), 'empty');
  assert.equal(code({ name: 'A', phone: '9840011223', items: [{ id: 'p4', qty: 1 }] }), 'unknown_item');
  assert.equal(code({ name: 'A', phone: '9840011223', items: [{ id: 'p2', qty: 1 }] }), 'out_of_stock');
  assert.equal(code({ name: 'A', phone: '9840011223', items: [{ id: 'p1', qty: 0 }] }), 'bad_qty');
  assert.equal(code({ name: 'A', phone: '9840011223', items: [{ id: 'p1', qty: 1000 }] }), 'bad_qty');
  assert.equal(code({ name: 'A', phone: '9840011223', website: 'x', items: [{ id: 'p1', qty: 1 }] }), 'spam');
  assert.equal(code({ name: 'A', phone: '9840011223', items: Array.from({ length: ORDER_LIMITS.maxItems + 1 }, () => ({ id: 'p1', qty: 1 })) }), 'too_many_items');
  assert.equal(validateOrder(null, cat).code, 'bad_request');
});

group('rate limit + order numbers', () => {
  assert.equal(rateLimitOk({ ipRecent: 0, shopRecent: 0 }).ok, true);
  assert.equal(rateLimitOk({ ipRecent: ORDER_LIMITS.ipPer10Min }).code, 'rate_ip');
  assert.equal(rateLimitOk({ ipRecent: 1, shopRecent: ORDER_LIMITS.shopPerHour }).code, 'rate_shop');
  const no = makeOrderNo(new Date('2026-10-11T08:00:00Z'), () => 0);
  assert.equal(no, 'W261011-AAAA');
  assert.match(makeOrderNo(), /^W\d{6}-[A-Z2-9]{4}$/);
});

group('page render escapes & SEO', () => {
  const shop = publicShop({ slug: 'my-shop', data: { name: '<b>Evil</b> "Shop"', tagline: 'Best </script> deals', whatsapp: '9840011223', upi: 'shop@upi', logo: 'http://insecure/logo.png', lang: 'ta' } });
  assert.equal(shop.logo, '');
  assert.equal(shop.whatsapp, '919840011223');
  const cat = buildCatalogue([{ id: 'x', name: '</script><img src=x onerror=alert(1)>', price: 10, data: {} }], {});
  const html = renderShopPage(shop, cat, { origin: 'https://gst-billing-pro.pages.dev', nonce: 'abc123' });
  assert.ok(html.includes('<title>&lt;b&gt;Evil&lt;/b&gt; &quot;Shop&quot; · '));
  assert.ok(html.includes('rel="canonical" href="https://gst-billing-pro.pages.dev/s/my-shop"'));
  assert.ok(html.includes('og:title'));
  assert.ok(html.includes('"@type":"Store"'));
  assert.ok(html.includes('lang="ta"'));
  assert.ok(html.includes(SHOP_T.ta.send));
  assert.equal((html.match(/<\/script>/g) || []).length, 3, 'no injected script close tags');
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('nonce="abc123"'));
  const nf = renderShopPage(null);
  assert.ok(nf.includes('noindex'));
});

group('order message + invoice draft', () => {
  const order = { name: 'Lakshmi', phone: '919840011223', address: 'T Nagar', note: '', items: [{ id: 'p1', name: 'Rice 5kg', unit: 'BAG', price: 450, qty: 2, amount: 900 }], total: 900 };
  const m = orderMessage(order, { orderNo: 'W1' });
  assert.ok(m.includes('New order W1'));
  assert.ok(m.includes('1. Rice 5kg × 2 BAG = ₹900'));
  assert.ok(m.includes('📍 T Nagar'));
  const draft = orderToBillDraft({ id: 'o1', order_no: 'W1', customer_name: 'Lakshmi', customer_phone: '919840011223', data: { items: order.items, address: 'T Nagar' } },
    [{ id: 'p1', hsn: '1006', taxPercent: 5, mrp: 520 }]);
  assert.equal(draft._isDuplicate, true);
  assert.equal(draft.data.client.name, 'Lakshmi');
  assert.equal(draft.data.items[0].taxPercent, 5);
  assert.equal(draft.data.items[0].hsn, '1006');
  assert.equal(draft.data.items[0].quantity, 2);
  assert.equal(draft.data.items[0].rate, 450);
  assert.equal(draft.data.customNotes, 'Online order W1');
});

console.log(`store-test: ${groups} groups passed`);
