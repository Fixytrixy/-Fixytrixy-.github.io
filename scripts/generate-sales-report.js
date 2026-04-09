#!/usr/bin/env node
/**
 * Fixaotrixa – Sales Summary Report Generator
 * =============================================
 * Fetches key metrics from the Shopify Admin REST API and outputs a clean
 * HTML report to /reports/sales-summary.html.
 * Fixaotrixa – Sales Analytics Report Generator
 * ==============================================
 * Generates /reports/sales-summary.html with key store metrics:
 *   • Top 10 products by revenue (last 30 days)
 *   • Conversion rate per collection
 *   • Products with zero sales last 30 days (deadstock alert)
 *   • Average order value (AOV) trend (last 30 days, weekly buckets)
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
 *   SHOPIFY_STORE_URL        – t.ex. xivfqd-hz.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN     – Admin API access token (read_orders + read_products)
 *
 * ── API-endpoints som används ────────────────────────────────────────────────
 *   GET /admin/api/2024-01/orders.json
 *       ?status=any&created_at_min=<ISO>&limit=250&fields=id,created_at,total_price,line_items
 *       – Hämtar alla beställningar de senaste 30 dagarna.
 *         Sida-iteration via Link-header (rel="next").
 *
 *   GET /admin/api/2024-01/products.json
 *       ?limit=250&fields=id,title,handle,variants,product_type
 *       – Hämtar alla produkter för att hitta deadstock.
 *
 *   GET /admin/api/2024-01/custom_collections.json
 *       ?limit=250&fields=id,title,handle
 *   GET /admin/api/2024-01/smart_collections.json
 *       ?limit=250&fields=id,title,handle
 *       – Hämtar alla kollektioner.
 *
 *   GET /admin/api/2024-01/collects.json
 *       ?collection_id=<id>&limit=250
 *       – Kopplar produkter till kollektioner (för konverteringsberäkning).
 *
 * ── Konverteringsfrekvens ────────────────────────────────────────────────────
 *   Shopify Admin REST API exponerar inte session-/visningsdata direkt.
 *   Fullständig konverteringsfrekvens (sessions → order) kräver antingen:
 *     a) Shopify Analytics / Reports API (Plus-plan)
 *        GET /admin/api/2024-01/reports.json
 *     b) Google Analytics 4 Data API (ga4-dimensioner: itemListName → sessions)
 *   I detta scaffold visas orders-per-kollektion som approximation.
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

const USE_LIVE_DATA = Boolean(
  SHOPIFY_STORE &&
  SHOPIFY_TOKEN &&
  !SHOPIFY_TOKEN.includes('din_shopify')
);

/* ─── HTTPS helper ─── */
function httpsGet(hostname, pathStr, token) {
  return new Promise(function (resolve, reject) {
    const options = {
      hostname,
      path: pathStr,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      }
    };
    const req = https.request(options, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try {
          resolve({ body: JSON.parse(data), headers: res.headers, status: res.statusCode });
        } catch (e) {
          reject(new Error('JSON parse error (' + res.statusCode + '): ' + data.slice(0, 300)));
        }
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
/* Paginated Shopify GET – follows Link header rel="next" */
async function shopifyGetAll(endpoint) {
  const results = [];
  let nextPath = '/admin/api/' + API_VERSION + endpoint;

  while (nextPath) {
    const { body, headers } = await httpsGet(SHOPIFY_STORE, nextPath, SHOPIFY_TOKEN);
    const key = Object.keys(body)[0];
    if (Array.isArray(body[key])) results.push(...body[key]);

    /* Parse Link header for next page */
    const link = headers['link'] || '';
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      /* Extract path+query from absolute URL */
      const url = new URL(match[1]);
      nextPath = url.pathname + url.search;
    } else {
      nextPath = null;
    }
  }
  return results;
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
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('sv-SE');
}

function weekLabel(iso) {
  const d = new Date(iso);
  const week = Math.ceil(d.getDate() / 7);
  return d.toLocaleDateString('sv-SE', { month: 'short' }) + ' v' + week;
}

/* ─── Live data fetch ─── */
async function fetchLiveData() {
  console.log('🔗 Ansluter till Shopify Admin API…');
  const since = daysAgo(30);

  const [orders, products, customCols, smartCols] = await Promise.all([
    shopifyGetAll(
      '/orders.json?status=any&created_at_min=' +
      encodeURIComponent(since) +
      '&limit=250&fields=id,created_at,total_price,line_items'
    ),
    shopifyGetAll('/products.json?limit=250&fields=id,title,handle,variants,product_type'),
    shopifyGetAll('/custom_collections.json?limit=250&fields=id,title,handle'),
    shopifyGetAll('/smart_collections.json?limit=250&fields=id,title,handle')
  ]);

  const collections = [...customCols, ...smartCols];
  console.log('  Orders: ' + orders.length + ', Products: ' + products.length +
    ', Collections: ' + collections.length);

  /* --- Top 10 products by revenue --- */
  const revenueMap = {};
  orders.forEach(function (order) {
    (order.line_items || []).forEach(function (item) {
      const id = String(item.product_id);
      revenueMap[id] = (revenueMap[id] || 0) + parseFloat(item.price) * item.quantity;
    });
  });

  const productMap = {};
  products.forEach(function (p) { productMap[String(p.id)] = p; });

  const topProducts = Object.entries(revenueMap)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 10)
    .map(function (entry, i) {
      const p = productMap[entry[0]];
      return {
        rank: i + 1,
        title: p ? p.title : 'Okänd produkt',
        revenue: entry[1],
        handle: p ? p.handle : ''
      };
    });

  /* --- Deadstock (zero sales last 30 days) --- */
  const soldIds = new Set(Object.keys(revenueMap));
  const deadstock = products
    .filter(function (p) { return !soldIds.has(String(p.id)); })
    .map(function (p) { return { title: p.title, handle: p.handle, type: p.product_type }; });

  /* --- AOV trend (weekly buckets) --- */
  const weekBuckets = {};
  orders.forEach(function (order) {
    const label = weekLabel(order.created_at);
    if (!weekBuckets[label]) weekBuckets[label] = { total: 0, count: 0 };
    weekBuckets[label].total += parseFloat(order.total_price);
    weekBuckets[label].count += 1;
  });
  const aovTrend = Object.entries(weekBuckets).map(function (entry) {
    return {
      week: entry[0],
      aov: entry[1].count ? (entry[1].total / entry[1].count) : 0,
      orders: entry[1].count
    };
  });

  /* --- Conversion rate per collection (orders-based approximation) --- */
  /* Build product→collections map via /collects */
  const productCollectionMap = {};
  for (const col of collections.slice(0, 20)) { /* limit API calls */
    try {
      const collects = await shopifyGetAll(
        '/collects.json?collection_id=' + col.id + '&limit=250'
      );
      collects.forEach(function (c) {
        const pid = String(c.product_id);
        if (!productCollectionMap[pid]) productCollectionMap[pid] = [];
        productCollectionMap[pid].push(col.title);
      });
    } catch (_) { /* ignore */ }
  }

  const colOrdersMap = {};
  const colProductsMap = {};
  orders.forEach(function (order) {
    (order.line_items || []).forEach(function (item) {
      const pid = String(item.product_id);
      const cols = productCollectionMap[pid] || ['Okategoriserad'];
      cols.forEach(function (colTitle) {
        colOrdersMap[colTitle] = (colOrdersMap[colTitle] || 0) + 1;
      });
    });
  });
  products.forEach(function (p) {
    const cols = productCollectionMap[String(p.id)] || ['Okategoriserad'];
    cols.forEach(function (colTitle) {
      colProductsMap[colTitle] = (colProductsMap[colTitle] || 0) + 1;
    });
  });

  const conversionRates = Object.entries(colOrdersMap).map(function (entry) {
    const productsInCol = colProductsMap[entry[0]] || 1;
    return {
      collection: entry[0],
      orders: entry[1],
      products: productsInCol,
      /* orders ÷ products as a proxy (real sessions need Analytics API) */
      rate: ((entry[1] / productsInCol) * 100).toFixed(1)
    };
  }).sort(function (a, b) { return b.orders - a.orders; }).slice(0, 10);

  const totalRevenue = Object.values(revenueMap).reduce(function (s, v) { return s + v; }, 0);
  const totalOrders  = orders.length;

  return { topProducts, deadstock, aovTrend, conversionRates, totalRevenue, totalOrders, isLive: true };
}

/* ─── Placeholder data ─── */
function placeholderData() {
  console.log('ℹ️  Inga API-uppgifter – använder exempeldata (scaffold).');
  const topProducts = [
    { rank: 1, title: 'KALLAX Hyllsystem 4×4 – IKEA', revenue: 48200, handle: 'kallax-4x4' },
    { rank: 2, title: 'Förvaringslåda med lock, bamboo', revenue: 31750, handle: 'bamboo-box-lid' },
    { rank: 3, title: 'Skohylla, 3-plan vit stål', revenue: 28400, handle: 'shoe-rack-3tier' },
    { rank: 4, title: 'Köksorganizer, roterande bambu', revenue: 22100, handle: 'kitchen-turntable' },
    { rank: 5, title: 'Garderobsorganizer med dragkedjor', revenue: 19850, handle: 'wardrobe-organizer' },
    { rank: 6, title: 'Duschhylla rostfritt stål 3-plan', revenue: 17600, handle: 'shower-rack-3tier' },
    { rank: 7, title: 'Skrivbordsorganizer – 7 fack', revenue: 14900, handle: 'desk-organizer-7' },
    { rank: 8, title: 'Hallmöbel med 8 krokar & hylla', revenue: 13250, handle: 'hallway-hooks' },
    { rank: 9, title: 'Foldbar förvaringskorg, set om 3', revenue: 11400, handle: 'foldable-basket-3' },
    { rank: 10, title: 'Utomhusbox, vädertålig 120 L', revenue: 9800, handle: 'outdoor-box-120l' }
  ];

  const deadstock = [
    { title: 'Underbed Storage Bag, set om 2', handle: 'underbed-bag-2', type: 'Sovrumsförvaring' },
    { title: 'Magnetisk kryddhylla, 6 burkar', handle: 'spice-rack-mag', type: 'Köksförvaring' },
    { title: 'Plastlåda stapelbar 45 L', handle: 'plastic-box-45l', type: 'Allmän förvaring' },
    { title: 'Vakuumpåsar för kläder, 6-pack', handle: 'vacuum-bags-6', type: 'Sovrumsförvaring' },
    { title: 'Verktygstavla pegboard 60×90 cm', handle: 'pegboard-60x90', type: 'Garagförvaring' }
  ];

  const today = new Date();
  const aovTrend = [-3, -2, -1, 0].map(function (weekOffset) {
    const d = new Date(today);
    d.setDate(d.getDate() + weekOffset * 7);
    const base = 420 + weekOffset * 15 + Math.round(Math.random() * 40 - 20);
    return {
      week: d.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }) + ' (v' +
            (Math.ceil(d.getDate() / 7)) + ')',
      aov: base,
      orders: 18 + weekOffset * 3 + Math.round(Math.random() * 5)
    };
  });

  const conversionRates = [
    { collection: 'Köksförvaring',      orders: 124, products: 38, rate: '3.3' },
    { collection: 'Sovrumsförvaring',   orders: 98,  products: 31, rate: '3.2' },
    { collection: 'Badrumsförvaring',   orders: 76,  products: 24, rate: '3.2' },
    { collection: 'Hallförvaring',      orders: 61,  products: 22, rate: '2.8' },
    { collection: 'Kontorsförvaring',   orders: 49,  products: 20, rate: '2.5' },
    { collection: 'Trädgårdsförvaring', orders: 31,  products: 17, rate: '1.8' }
  ];

  return {
    topProducts,
    deadstock,
    aovTrend,
    conversionRates,
    totalRevenue: topProducts.reduce(function (s, p) { return s + p.revenue; }, 0) * 1.6,
    totalOrders: 472,
    isLive: false
  };
}

/* ─── HTML Generator ─── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSEK(amount) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
    .format(amount);
}

function aovChartBars(trend) {
  if (!trend.length) return '<p class="no-data">Ingen data</p>';
  const max = Math.max(...trend.map(function (t) { return t.aov; }));
  return trend.map(function (t) {
    const pct = max ? Math.round((t.aov / max) * 100) : 0;
    return '<div class="bar-group">' +
      '<div class="bar-label">' + escapeHtml(t.week) + '</div>' +
      '<div class="bar-track">' +
        '<div class="bar-fill" style="width:' + pct + '%"></div>' +
        '<span class="bar-value">' + formatSEK(t.aov) + '</span>' +
      '</div>' +
      '<div class="bar-sub">' + t.orders + ' order</div>' +
    '</div>';
  }).join('');
}

function generateHTML(data) {
  const now      = new Date().toLocaleString('sv-SE');
  const badge    = data.isLive
    ? '<span class="badge badge--live">● Live-data</span>'
    : '<span class="badge badge--demo">◌ Exempeldata (scaffold)</span>';
  const apiNote  = data.isLive ? '' : `
  <div class="api-note">
    <strong>📡 API-uppkoppling saknas.</strong>
    Sätt <code>SHOPIFY_STORE_URL</code> och <code>SHOPIFY_ACCESS_TOKEN</code> i din
    <code>.env</code>-fil och kör <code>npm run report</code> igen för live-data.
    Se kommentarerna i <code>scripts/generate-sales-report.js</code> för en fullständig
    lista över vilka Admin API-endpoints som används.
  </div>`;

  const topTable = data.topProducts.map(function (p) {
    const url = p.handle
      ? 'https://' + (SHOPIFY_STORE || 'din-butik.myshopify.com') + '/products/' + p.handle
      : '#';
    return '<tr>' +
      '<td class="rank">' + p.rank + '</td>' +
      '<td><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
        escapeHtml(p.title) + '</a></td>' +
      '<td class="num">' + formatSEK(p.revenue) + '</td>' +
    '</tr>';
  }).join('');

  const convTable = data.conversionRates.map(function (c) {
    const rateNum = parseFloat(c.rate);
    const cls = rateNum >= 3 ? 'good' : rateNum >= 2 ? 'warn' : 'bad';
    return '<tr>' +
      '<td>' + escapeHtml(c.collection) + '</td>' +
      '<td class="num">' + c.orders + '</td>' +
      '<td class="num">' + c.products + '</td>' +
      '<td class="num"><span class="rate rate--' + cls + '">' + c.rate + '%</span></td>' +
    '</tr>';
  }).join('');

  const deadRows = data.deadstock.length
    ? data.deadstock.map(function (d) {
        const url = d.handle
          ? 'https://' + (SHOPIFY_STORE || 'din-butik.myshopify.com') + '/products/' + d.handle
          : '#';
        return '<tr>' +
          '<td><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
            escapeHtml(d.title) + '</a></td>' +
          '<td>' + escapeHtml(d.type || '—') + '</td>' +
          '<td class="num dead">0 kr</td>' +
        '</tr>';
      }).join('')
    : '<tr><td colspan="3" class="no-data">✅ Inga deadstock-produkter hittades!</td></tr>';

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

  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fixaotrixa – Försäljningsanalys (senaste 30 dagarna)</title>
  <style>
    /* ── Reset & base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f2f5;
      color: #212121;
      font-size: 15px;
      line-height: 1.6;
    }
    a { color: #1565c0; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Layout ── */
    .page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
    header { margin-bottom: 32px; }
    header h1 { font-size: 1.75rem; font-weight: 700; color: #2e7d32; }
    header p  { color: #555; font-size: 0.9rem; margin-top: 4px; }
    .meta     { display: flex; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }

    /* ── Badge ── */
    .badge {
      display: inline-block; padding: 3px 10px; border-radius: 12px;
      font-size: 0.78rem; font-weight: 600;
    }
    .badge--live { background: #e8f5e9; color: #2e7d32; }
    .badge--demo { background: #fff3e0; color: #e65100; }

    /* ── API note ── */
    .api-note {
      background: #fff8e1; border-left: 4px solid #f9a825;
      padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;
      font-size: 0.88rem; line-height: 1.7;
    }
    .api-note code { background: #f5f5f5; padding: 1px 5px; border-radius: 3px; }

    /* ── KPI Cards ── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .kpi-card {
      background: #fff; border-radius: 10px;
      padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }
    .kpi-card__label { font-size: 0.8rem; color: #777; text-transform: uppercase; letter-spacing: .5px; }
    .kpi-card__value { font-size: 1.8rem; font-weight: 700; color: #2e7d32; margin-top: 4px; }
    .kpi-card__sub   { font-size: 0.8rem; color: #999; margin-top: 2px; }

    /* ── Section cards ── */
    .section {
      background: #fff; border-radius: 10px;
      padding: 24px; margin-bottom: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }
    .section h2 {
      font-size: 1.1rem; font-weight: 600; margin-bottom: 16px;
      padding-bottom: 10px; border-bottom: 2px solid #f0f2f5;
    }
    .section h2 .icon { margin-right: 6px; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; }
    th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: .5px;
         color: #777; background: #fafafa; }
    tr:not(:last-child) td { border-bottom: 1px solid #f0f2f5; }
    tr:hover td { background: #fafafa; }
    td.num  { text-align: right; font-variant-numeric: tabular-nums; }
    td.rank { color: #bbb; font-weight: 600; width: 36px; }
    td.dead { color: #c62828; }

    /* ── Rate badges ── */
    .rate { display: inline-block; padding: 2px 8px; border-radius: 10px; font-weight: 600; font-size: 0.85rem; }
    .rate--good { background: #e8f5e9; color: #2e7d32; }
    .rate--warn  { background: #fff3e0; color: #e65100; }
    .rate--bad   { background: #ffebee; color: #c62828; }

    /* ── AOV bar chart ── */
    .bar-chart { display: flex; flex-direction: column; gap: 14px; }
    .bar-group {}
    .bar-label { font-size: 0.82rem; color: #555; margin-bottom: 4px; }
    .bar-track  {
      display: flex; align-items: center; gap: 10px;
      background: #f0f2f5; border-radius: 6px; overflow: hidden; height: 28px;
    }
    .bar-fill   { background: #2e7d32; height: 100%; border-radius: 6px; transition: width .3s; }
    .bar-value  { font-size: 0.85rem; font-weight: 600; white-space: nowrap; padding-right: 8px; }
    .bar-sub    { font-size: 0.78rem; color: #999; margin-top: 2px; }

    /* ── Deadstock alert ── */
    .dead-count {
      display: inline-block; background: #ffebee; color: #c62828;
      font-weight: 700; padding: 3px 10px; border-radius: 10px; font-size: 0.85rem;
      margin-left: 8px;
    }

    /* ── Responsive ── */
    @media (max-width: 600px) {
      .kpi-card__value { font-size: 1.4rem; }
      th, td { padding: 8px; font-size: 0.82rem; }
    }

    .no-data { color: #999; font-style: italic; padding: 16px 0; }
    footer { text-align: center; color: #aaa; font-size: 0.8rem; margin-top: 48px; }
  </style>
</head>
<body>
<div class="page">
  <header>
    <h1>📊 Fixaotrixa – Försäljningsanalys</h1>
    <div class="meta">
      ${badge}
      <p>Senaste 30 dagarna &nbsp;·&nbsp; Genererad: ${now}</p>
    </div>
  </header>

  ${apiNote}

  <!-- KPI Summary -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-card__label">Total omsättning</div>
      <div class="kpi-card__value">${formatSEK(data.totalRevenue)}</div>
      <div class="kpi-card__sub">senaste 30 dagarna</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">Antal order</div>
      <div class="kpi-card__value">${data.totalOrders}</div>
      <div class="kpi-card__sub">senaste 30 dagarna</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">Genomsnittligt ordervärde</div>
      <div class="kpi-card__value">${data.totalOrders ? formatSEK(data.totalRevenue / data.totalOrders) : '—'}</div>
      <div class="kpi-card__sub">AOV (snitt)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__label">Deadstock-produkter</div>
      <div class="kpi-card__value" style="color:${data.deadstock.length ? '#c62828' : '#2e7d32'}">${data.deadstock.length}</div>
      <div class="kpi-card__sub">0 sålda senaste 30 dgr</div>
    </div>
  </div>

  <!-- Top 10 Products -->
  <div class="section">
    <h2><span class="icon">🏆</span>Topp 10 produkter efter omsättning</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Produkt</th>
          <th style="text-align:right">Omsättning (30 dgr)</th>
        </tr>
      </thead>
      <tbody>${topTable}</tbody>
    </table>
  </div>

  <!-- Conversion Rate per Collection -->
  <div class="section">
    <h2><span class="icon">🛒</span>Konverteringsfrekvens per kollektion</h2>
    <p style="font-size:.82rem;color:#777;margin-bottom:12px">
      Proxy-mått: order per kollektion ÷ antal produkter i kollektionen.
      För sessionsbaserad konvertering behövs Shopify Analytics API (Plus) eller GA4 Data API.
    </p>
    <table>
      <thead>
        <tr>
          <th>Kollektion</th>
          <th style="text-align:right">Order (30 dgr)</th>
          <th style="text-align:right">Produkter</th>
          <th style="text-align:right">Konv.-frekvens</th>
        </tr>
      </thead>
      <tbody>${convTable}</tbody>
    </table>
  </div>

  <!-- AOV Trend -->
  <div class="section">
    <h2><span class="icon">📈</span>AOV-trend (veckovis, senaste 4 veckorna)</h2>
    <div class="bar-chart">${aovChartBars(data.aovTrend)}</div>
  </div>

  <!-- Deadstock Alert -->
  <div class="section">
    <h2>
      <span class="icon">⚠️</span>Deadstock-varning
      <span class="dead-count">${data.deadstock.length} produkt${data.deadstock.length !== 1 ? 'er' : ''}</span>
    </h2>
    <p style="font-size:.82rem;color:#777;margin-bottom:12px">
      Produkter utan en enda försäljning de senaste 30 dagarna.
    </p>
    <table>
      <thead>
        <tr>
          <th>Produkt</th>
          <th>Produkttyp</th>
          <th style="text-align:right">Omsättning (30 dgr)</th>
        </tr>
      </thead>
      <tbody>${deadRows}</tbody>
    </table>
  </div>

  <footer>
    Fixaotrixa Admin Dashboard &nbsp;·&nbsp;
    Genererad av <code>scripts/generate-sales-report.js</code> &nbsp;·&nbsp;
    ${now}
  </footer>
</div>
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
/* ─── Main ─── */
async function main() {
  console.log('\n📊 Fixaotrixa – Sales Report Generator');
  console.log('  Butik: ' + (SHOPIFY_STORE || '(ej konfigurerad)'));
  console.log('  Läge:  ' + (USE_LIVE_DATA ? 'LIVE (Shopify API)' : 'SCAFFOLD (exempeldata)') + '\n');

  let data;
  if (USE_LIVE_DATA) {
    try {
      data = await fetchLiveData();
    } catch (err) {
      console.error('❌ API-fel: ' + err.message);
      console.log('   Faller tillbaka på exempeldata…\n');
      data = placeholderData();
    }
  } else {
    data = placeholderData();
  }

  const html      = generateHTML(data);
  const outputDir = path.join(__dirname, '..', 'reports');
  const outFile   = path.join(outputDir, 'sales-summary.html');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');

  console.log('✅ Rapport sparad: ' + outFile);
  console.log('   Produkter analyserade: ' + (data.topProducts.length + data.deadstock.length));
  console.log('   Deadstock-varningar:   ' + data.deadstock.length);
  console.log('   AOV-datapunkter:       ' + data.aovTrend.length);
}

main().catch(function (err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
