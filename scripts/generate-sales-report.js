#!/usr/bin/env node
/**
 * Fixaotrixa – Sales Summary Report Generator
 * =============================================
 * Fetches key metrics from the Shopify Admin REST API and outputs a clean
 * HTML report to /reports/sales-summary.html.
 *
 * Krav: Node.js 18+
 *
 * Användning:
 *   node scripts/generate-sales-report.js
 *   npm run report
 *
 * Miljövariabler (se .env.example):
 *   SHOPIFY_STORE_URL    – t.ex. xivfqd-hz.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN – Admin API access token (read_orders + read_products scopes)
 *
 * ─── Shopify Admin API Endpoints Used ────────────────────────────────────────
 *
 * 1. Orders (last 30 days)
 *    GET /admin/api/2024-01/orders.json
 *        ?status=any
 *        &financial_status=paid
 *        &created_at_min=<ISO-date>
 *        &limit=250
 *    Required scope: read_orders
 *    Docs: https://shopify.dev/docs/api/admin-rest/2024-01/resources/order
 *
 * 2. All products
 *    GET /admin/api/2024-01/products.json?limit=250&fields=id,title,handle
 *    Required scope: read_products
 *    Docs: https://shopify.dev/docs/api/admin-rest/2024-01/resources/product
 *
 * 3. Custom collections
 *    GET /admin/api/2024-01/custom_collections.json?limit=250
 *    Required scope: read_products
 *    Docs: https://shopify.dev/docs/api/admin-rest/2024-01/resources/customcollection
 *
 * 4. Smart collections
 *    GET /admin/api/2024-01/smart_collections.json?limit=250
 *    Required scope: read_products
 *    Docs: https://shopify.dev/docs/api/admin-rest/2024-01/resources/smartcollection
 *
 * 5. Collects (product→collection mapping)
 *    GET /admin/api/2024-01/collects.json?collection_id=<id>&limit=250
 *    Required scope: read_products
 *    Docs: https://shopify.dev/docs/api/admin-rest/2024-01/resources/collect
 *
 * NOTE: The Shopify Admin API returns max 250 records per page.
 *       For stores with >250 orders/products, implement cursor-based pagination
 *       using the Link header (rel="next") returned with each response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

/* ─── Load .env ─── */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  });
}

loadEnv();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION   = '2024-01';
const REPORTS_DIR   = path.join(__dirname, '..', 'reports');
const OUTPUT_FILE   = path.join(REPORTS_DIR, 'sales-summary.html');

/* ─── Generic HTTPS request ─── */
function httpsRequest(options) {
  return new Promise(function (resolve, reject) {
    const req = https.request(options, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* ─── Shopify REST helper ─── */
function shopifyGet(endpoint) {
  return httpsRequest({
    hostname: SHOPIFY_STORE,
    path:     '/admin/api/' + API_VERSION + endpoint,
    method:   'GET',
    headers: {
      'Content-Type':             'application/json',
      'X-Shopify-Access-Token':   SHOPIFY_TOKEN
    }
  });
}

/* ─── Date helpers ─── */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('sv-SE');
}

/* ─── Fetch live data from Shopify ─── */
async function fetchLiveData() {
  const since = daysAgo(30);

  console.log('  📡 Hämtar orders (senaste 30 dagar)…');
  const ordersResp = await shopifyGet(
    '/orders.json?status=any&financial_status=paid&created_at_min=' +
    encodeURIComponent(since) + '&limit=250'
  );
  if (ordersResp.status !== 200) {
    throw new Error('Orders API returned ' + ordersResp.status);
  }
  const orders = ordersResp.body.orders || [];

  console.log('  📡 Hämtar alla produkter…');
  const productsResp = await shopifyGet('/products.json?limit=250&fields=id,title,handle');
  if (productsResp.status !== 200) {
    throw new Error('Products API returned ' + productsResp.status);
  }
  const products = productsResp.body.products || [];

  console.log('  📡 Hämtar kollektioner…');
  const [customResp, smartResp] = await Promise.all([
    shopifyGet('/custom_collections.json?limit=250'),
    shopifyGet('/smart_collections.json?limit=250')
  ]);
  const collections = [
    ...(customResp.body.custom_collections || []),
    ...(smartResp.body.smart_collections  || [])
  ];

  return { orders, products, collections, since };
}

/* ─── Compute metrics ─── */
function computeMetrics(orders, products, collections) {
  /* ── 1. Top 10 products by revenue ── */
  const revenueMap = {};  /* productId → { title, revenue, units } */
  orders.forEach(function (order) {
    (order.line_items || []).forEach(function (item) {
      const id  = String(item.product_id);
      const rev = parseFloat(item.price) * (item.quantity || 1);
      if (!revenueMap[id]) revenueMap[id] = { title: item.title, revenue: 0, units: 0 };
      revenueMap[id].revenue += rev;
      revenueMap[id].units   += item.quantity || 1;
    });
  });

  const topProducts = Object.entries(revenueMap)
    .map(function ([id, v]) { return { id, title: v.title, revenue: v.revenue, units: v.units }; })
    .sort(function (a, b) { return b.revenue - a.revenue; })
    .slice(0, 10);

  /* ── 2. Deadstock – products with zero sales ── */
  const soldProductIds = new Set(Object.keys(revenueMap));
  const deadstock = products.filter(function (p) {
    return !soldProductIds.has(String(p.id));
  });

  /* ── 3. Average order value trend (weekly buckets over last 30 days) ── */
  const weekBuckets = { W1: [], W2: [], W3: [], W4: [] };
  const now = Date.now();
  orders.forEach(function (order) {
    const age = Math.floor((now - new Date(order.created_at).getTime()) / 86400000);
    const aov = parseFloat(order.total_price || 0);
    if (age <= 7)        weekBuckets.W4.push(aov);
    else if (age <= 14)  weekBuckets.W3.push(aov);
    else if (age <= 21)  weekBuckets.W2.push(aov);
    else                 weekBuckets.W1.push(aov);
  });

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
  }

  const aovTrend = [
    { label: 'Vecka 1 (dag 22–30)', value: avg(weekBuckets.W1) },
    { label: 'Vecka 2 (dag 15–21)', value: avg(weekBuckets.W2) },
    { label: 'Vecka 3 (dag 8–14)',  value: avg(weekBuckets.W3) },
    { label: 'Vecka 4 (dag 1–7)',   value: avg(weekBuckets.W4) }
  ];

  /* ── 4. Conversion rate per collection ── */
  /* We approximate: orders that reference products in each collection. */
  const collectionRevenue = {};
  collections.forEach(function (c) { collectionRevenue[c.id] = { title: c.title, orders: 0, totalOrders: orders.length }; });

  /* Without the Collects endpoint (to avoid rate-limit overhead), we do a
     lightweight heuristic: match collection title keywords against product
     handles / line-item titles in orders. A full implementation would call
     GET /collects.json?collection_id=<id> per collection. */
  orders.forEach(function (order) {
    const titleWords = (order.line_items || []).map(function (li) { return (li.title || '').toLowerCase(); }).join(' ');
    collections.forEach(function (c) {
      const keyword = c.handle.replace(/-/g, ' ');
      if (titleWords.includes(keyword)) {
        collectionRevenue[c.id].orders += 1;
      }
    });
  });

  const conversionRates = Object.values(collectionRevenue).map(function (c) {
    const rate = c.totalOrders > 0 ? (c.orders / c.totalOrders * 100) : 0;
    return { title: c.title, orders: c.orders, rate: rate.toFixed(1) };
  }).sort(function (a, b) { return b.rate - a.rate; });

  /* ── Summary stats ── */
  const totalRevenue = orders.reduce(function (s, o) { return s + parseFloat(o.total_price || 0); }, 0);
  const overallAov   = orders.length ? totalRevenue / orders.length : 0;

  return { topProducts, deadstock, aovTrend, conversionRates, totalRevenue, overallAov, orderCount: orders.length };
}

/* ─── Placeholder data (used when API credentials are not configured) ─── */
function getPlaceholderData() {
  console.log('  ℹ️  Inga API-uppgifter – använder exempeldata.');
  return {
    isPlaceholder: true,
    since: daysAgo(30),
    topProducts: [
      { id: '1', title: 'SKUBB Förvaringsbox 6-pack',            revenue: 12450, units: 35 },
      { id: '2', title: 'RÅSKOG Rullvagn med 3 hyllplan',        revenue: 9870,  units: 18 },
      { id: '3', title: 'KALLAX Hyllsystem 4×4',                 revenue: 8640,  units: 12 },
      { id: '4', title: 'JONAXEL Garderobssystem',               revenue: 7920,  units: 9  },
      { id: '5', title: 'TROFAST Förvaringssystem med lådor',    revenue: 6500,  units: 20 },
      { id: '6', title: 'GRUNDTAL Knivmagnet rostfritt stål',    revenue: 5100,  units: 42 },
      { id: '7', title: 'HEMNES Sängbord med 1 låda',            revenue: 4700,  units: 10 },
      { id: '8', title: 'BROR Arbetsbänk med hyllor',            revenue: 4300,  units: 7  },
      { id: '9', title: 'VESKEN Organizer för badrum',           revenue: 3900,  units: 26 },
      { id: '10', title: 'TILLREDA Bärbar induktionshäll',       revenue: 3600,  units: 8  }
    ],
    deadstock: [
      { id: '101', title: 'ALGOT Väggstång + hyllor',    handle: 'algot-vaggstang' },
      { id: '102', title: 'OMAR Hyllsystem galvaniserat', handle: 'omar-hyllsystem' },
      { id: '103', title: 'PLUGGIS Papperskorg 10-pack', handle: 'pluggis-papperskorg' }
    ],
    aovTrend: [
      { label: 'Vecka 1 (dag 22–30)', value: 310 },
      { label: 'Vecka 2 (dag 15–21)', value: 335 },
      { label: 'Vecka 3 (dag 8–14)',  value: 362 },
      { label: 'Vecka 4 (dag 1–7)',   value: 388 }
    ],
    conversionRates: [
      { title: 'Köksförvaring',      orders: 48, rate: '22.0' },
      { title: 'Sovrumsförvaring',   orders: 39, rate: '17.9' },
      { title: 'Badrumsförvaring',   orders: 31, rate: '14.2' },
      { title: 'Hallförvaring',      orders: 27, rate: '12.4' },
      { title: 'Kontorsförvaring',   orders: 22, rate: '10.1' },
      { title: 'Trädgårdsförvaring', orders: 15, rate: '6.9'  }
    ],
    totalRevenue: 67480,
    overallAov:   309.5,
    orderCount:   218
  };
}

/* ─── HTML template ─── */
function buildHtml(data, generatedAt) {
  const isPlaceholder = data.isPlaceholder === true;
  const sinceDate     = formatDate(data.since);
  const todayDate     = new Date(generatedAt).toLocaleDateString('sv-SE');

  /* AOV sparkline bar heights (relative to max) */
  const aovMax = Math.max(...data.aovTrend.map(function (w) { return w.value; })) || 1;

  /* ── colour coding for deadstock count ── */
  const deadCount = data.deadstock.length;
  const deadColour = deadCount === 0 ? '#16a34a' : deadCount < 10 ? '#d97706' : '#dc2626';

  /* ── Top products rows ── */
  const topProductRows = data.topProducts.map(function (p, i) {
    const revenueStr = Number(p.revenue).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rank       = i + 1;
    const medal      = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
    return `
      <tr>
        <td class="rank">${medal}</td>
        <td>${escHtml(p.title)}</td>
        <td class="num">${p.units.toLocaleString('sv-SE')}</td>
        <td class="num revenue">${revenueStr} kr</td>
      </tr>`;
  }).join('');

  /* ── Conversion rate rows ── */
  const conversionRows = data.conversionRates.map(function (c) {
    const barWidth = Math.round(parseFloat(c.rate));
    return `
      <tr>
        <td>${escHtml(c.title)}</td>
        <td class="num">${c.orders.toLocaleString('sv-SE')}</td>
        <td>
          <div class="bar-wrap">
            <div class="bar" style="width:${barWidth}%"></div>
            <span class="bar-label">${c.rate}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  /* ── Deadstock rows ── */
  const deadstockRows = data.deadstock.slice(0, 50).map(function (p) {
    return `
      <tr>
        <td>${escHtml(p.title)}</td>
        <td class="handle">${escHtml(p.handle || p.id)}</td>
      </tr>`;
  }).join('');

  /* ── AOV trend bars ── */
  const aovBars = data.aovTrend.map(function (w) {
    const h     = Math.round((w.value / aovMax) * 120);
    const label = Number(w.value).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `
      <div class="aov-bar-wrap">
        <div class="aov-value">${label} kr</div>
        <div class="aov-bar" style="height:${h}px"></div>
        <div class="aov-week">${escHtml(w.label)}</div>
      </div>`;
  }).join('');

  /* ── Summary cards ── */
  const totalRevStr = Number(data.totalRevenue).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const aovStr      = Number(data.overallAov).toLocaleString('sv-SE',   { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const placeholderBanner = isPlaceholder ? `
    <div class="placeholder-banner">
      ⚠️ <strong>Exempeldata</strong> – Koppla in dina Shopify-uppgifter i <code>.env</code> för att se riktiga siffror.
      Rätt API-scope: <code>read_orders</code> och <code>read_products</code>.
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fixaotrixa – Försäljningsrapport</title>
  <style>
    :root {
      --primary:   #2563eb;
      --success:   #16a34a;
      --warning:   #d97706;
      --danger:    #dc2626;
      --bg:        #f8fafc;
      --card:      #ffffff;
      --border:    #e2e8f0;
      --text:      #1e293b;
      --muted:     #64748b;
      --bar-color: #3b82f6;
      --aov-bar:   #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: var(--bg); color: var(--text); padding: 24px; line-height: 1.5; }
    header { max-width: 1100px; margin: 0 auto 32px; }
    header h1 { font-size: 1.8rem; font-weight: 700; color: var(--primary); }
    header p  { color: var(--muted); font-size: 0.9rem; margin-top: 4px; }
    .placeholder-banner {
      background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px;
      padding: 12px 16px; margin-top: 16px; font-size: 0.9rem; color: #92400e;
    }
    .placeholder-banner code { background: #fde68a; padding: 1px 4px; border-radius: 3px; }
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                     gap: 16px; max-width: 1100px; margin: 0 auto 32px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px;
            padding: 20px; }
    .card .label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase;
                   letter-spacing: .05em; }
    .card .value { font-size: 1.7rem; font-weight: 700; margin-top: 4px; }
    .card .sub   { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
    section { background: var(--card); border: 1px solid var(--border); border-radius: 10px;
              padding: 24px; max-width: 1100px; margin: 0 auto 24px; }
    section h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 16px;
                 border-bottom: 1px solid var(--border); padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th { text-align: left; color: var(--muted); font-size: 0.78rem; text-transform: uppercase;
         letter-spacing: .05em; padding: 6px 8px; border-bottom: 1px solid var(--border); }
    td { padding: 8px 8px; border-bottom: 1px solid var(--border); }
    tr:last-child td { border-bottom: none; }
    td.rank    { width: 40px; text-align: center; font-size: 1.1rem; }
    td.num     { text-align: right; font-variant-numeric: tabular-nums; }
    td.revenue { font-weight: 600; color: var(--success); }
    td.handle  { font-size: 0.8rem; color: var(--muted); font-family: monospace; }
    .bar-wrap  { display: flex; align-items: center; gap: 8px; }
    .bar       { height: 14px; background: var(--bar-color); border-radius: 3px;
                 max-width: 60%; min-width: 2px; }
    .bar-label { font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
    .aov-chart { display: flex; align-items: flex-end; gap: 24px; padding: 16px 0 0;
                 min-height: 160px; }
    .aov-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center;
                    gap: 6px; }
    .aov-bar   { width: 100%; background: var(--aov-bar); border-radius: 4px 4px 0 0;
                 min-height: 4px; }
    .aov-value { font-size: 0.85rem; font-weight: 600; }
    .aov-week  { font-size: 0.75rem; color: var(--muted); text-align: center; }
    .dead-summary { font-size: 0.9rem; margin-bottom: 12px; }
    .dead-count   { font-weight: 700; color: ${deadColour}; }
    .api-note { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;
                padding: 16px; font-size: 0.85rem; color: #0c4a6e; margin-top: 8px; }
    .api-note ul  { padding-left: 20px; margin-top: 8px; }
    .api-note li  { margin-bottom: 4px; }
    .api-note code { background: #e0f2fe; padding: 1px 4px; border-radius: 3px; }
    footer { max-width: 1100px; margin: 32px auto 0; text-align: center;
             font-size: 0.8rem; color: var(--muted); }
  </style>
</head>
<body>

<header>
  <h1>📊 Fixaotrixa – Försäljningsrapport</h1>
  <p>Period: ${sinceDate} – ${todayDate} &nbsp;|&nbsp; Genererad: ${new Date(generatedAt).toLocaleString('sv-SE')}</p>
  ${placeholderBanner}
</header>

<!-- Summary cards -->
<div class="summary-cards">
  <div class="card">
    <div class="label">Totala intäkter (30 dagar)</div>
    <div class="value">${totalRevStr} kr</div>
  </div>
  <div class="card">
    <div class="label">Antal betalda ordrar</div>
    <div class="value">${data.orderCount.toLocaleString('sv-SE')}</div>
  </div>
  <div class="card">
    <div class="label">Genomsnittligt ordervärde</div>
    <div class="value">${aovStr} kr</div>
  </div>
  <div class="card">
    <div class="label">Dödlagerprodukter</div>
    <div class="value" style="color:${deadColour}">${deadCount}</div>
    <div class="sub">Noll försäljningar senaste 30 dagarna</div>
  </div>
</div>

<!-- Top 10 products by revenue -->
<section>
  <h2>🏆 Topp 10 produkter efter intäkt (senaste 30 dagar)</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Produkt</th>
        <th style="text-align:right">Sålda enheter</th>
        <th style="text-align:right">Intäkt</th>
      </tr>
    </thead>
    <tbody>
      ${topProductRows || '<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:20px">Inga försäljningsdata</td></tr>'}
    </tbody>
  </table>
</section>

<!-- Conversion rate per collection -->
<section>
  <h2>🎯 Konverteringsgrad per kollektion</h2>
  <p style="font-size:0.82rem;color:var(--muted);margin-bottom:12px">
    Andel betalda ordrar (senaste 30 dagar) som innehåller produkter från respektive kollektion.
  </p>
  <table>
    <thead>
      <tr>
        <th>Kollektion</th>
        <th style="text-align:right">Ordrar</th>
        <th>Andel av totala ordrar</th>
      </tr>
    </thead>
    <tbody>
      ${conversionRows || '<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:20px">Inga kollektionsdata</td></tr>'}
    </tbody>
  </table>
</section>

<!-- Average order value trend -->
<section>
  <h2>📈 Genomsnittligt ordervärde – trend senaste 30 dagarna</h2>
  <div class="aov-chart">
    ${aovBars}
  </div>
</section>

<!-- Deadstock alert -->
<section>
  <h2>⚠️ Dödlager – produkter utan försäljning (senaste 30 dagar)</h2>
  <p class="dead-summary">
    <span class="dead-count">${deadCount} produkt${deadCount !== 1 ? 'er' : ''}</span>
    har inte sålts de senaste 30 dagarna.
  </p>
  ${deadCount > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Produktnamn</th>
        <th>Handle / ID</th>
      </tr>
    </thead>
    <tbody>
      ${deadstockRows}
    </tbody>
  </table>
  ${deadCount > 50 ? `<p style="font-size:0.82rem;color:var(--muted);margin-top:8px">… och ${deadCount - 50} till.</p>` : ''}
  ` : '<p style="color:var(--success);font-weight:600">🎉 Alla produkter har sålts de senaste 30 dagarna!</p>'}

  <div class="api-note">
    <strong>📌 API-endpoint för komplett dödlagerlista:</strong>
    <ul>
      <li>Hämta alla produkter: <code>GET /admin/api/2024-01/products.json?limit=250&fields=id,title,handle</code></li>
      <li>Hämta sålda produkt-ID:n via: <code>GET /admin/api/2024-01/orders.json?status=any&financial_status=paid&created_at_min=&lt;datum&gt;&limit=250</code></li>
      <li>Differensen = dödlagerprodukter</li>
    </ul>
  </div>
</section>

<footer>
  Fixaotrixa – Admin-intern rapport &nbsp;·&nbsp; Genererad av <code>scripts/generate-sales-report.js</code>
  &nbsp;·&nbsp; Dela inte denna sida publikt
</footer>

</body>
</html>`;
}

/* ─── HTML escape ─── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── Main ─── */
async function main() {
  console.log('\n📊 Fixaotrixa – Sales Report Generator');
  console.log('  Output: ' + OUTPUT_FILE + '\n');

  let metrics;
  const generatedAt = new Date().toISOString();

  if (SHOPIFY_STORE && SHOPIFY_TOKEN &&
      SHOPIFY_TOKEN !== 'din_shopify_access_token_här' &&
      SHOPIFY_STORE !== 'din_shopify_butik.myshopify.com') {
    console.log('  🔑 Hittade Shopify-uppgifter – hämtar livedata…');
    try {
      const { orders, products, collections, since } = await fetchLiveData();
      console.log('  ✅ ' + orders.length + ' ordrar, ' + products.length + ' produkter, ' + collections.length + ' kollektioner');
      const computed = computeMetrics(orders, products, collections);
      metrics = Object.assign({ since, isPlaceholder: false }, computed);
    } catch (err) {
      console.warn('  ⚠️  API-fel: ' + err.message + ' – faller tillbaka på exempeldata.');
      metrics = getPlaceholderData();
    }
  } else {
    metrics = getPlaceholderData();
  }

  /* Ensure reports/ directory exists */
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const html = buildHtml(metrics, generatedAt);
  fs.writeFileSync(OUTPUT_FILE, html, 'utf8');

  console.log('  ✅ Rapport skriven till ' + OUTPUT_FILE);
  console.log('  📂 Öppna filen i en webbläsare för att se resultatet.\n');
}

main().catch(function (err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
