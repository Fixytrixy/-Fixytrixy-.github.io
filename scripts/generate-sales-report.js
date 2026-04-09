#!/usr/bin/env node
/**
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
