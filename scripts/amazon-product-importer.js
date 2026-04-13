#!/usr/bin/env node
/**
 * Fixaotrixa – Amazon Product Importer
 * =====================================
 * Hämtar produkter från Amazon Product Advertising API 5.0
 * och importerar dem till Shopify via Admin REST API.
 *
 * Krav: Node.js 18+
 *
 * Användning:
 *   npm install          (installera beroenden)
 *   node scripts/amazon-product-importer.js
 *
 * Miljövariabler (se .env.example):
 *   SHOPIFY_STORE_URL    – t.ex. xivfqd-hz.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN – Admin API access token
 *   AMAZON_ACCESS_KEY    – Amazon PA-API Access Key
 *   AMAZON_SECRET_KEY    – Amazon PA-API Secret Key
 *   AMAZON_PARTNER_TAG   – Amazon Associates Partner Tag
 */

'use strict';

const https  = require('https');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

/* ─── Load .env ─── */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env-filen saknas. Kopiera .env.example till .env och fyll i dina nycklar.');
    process.exit(1);
  }
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

/* ─── Load .env only when this file is the entry point ─── */
if (require.main === module) {
  loadEnv();
}

const SHOPIFY_STORE   = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
const AMAZON_ACCESS   = process.env.AMAZON_ACCESS_KEY;
const AMAZON_SECRET   = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG     = process.env.AMAZON_PARTNER_TAG;
const AMAZON_REGION   = process.env.AMAZON_REGION   || 'eu-west-1';
const AMAZON_HOST     = 'webservices.amazon.se';
const AMAZON_PATH     = '/paapi5/searchitems';
const MIN_RATING      = 4.0;
const MIN_REVIEWS     = 50;

/* ─── Categories to import ─── */
const CATEGORIES = [
  { shopifyHandle: 'koksforvaring',      keywords: 'köksförvaring organizer skafferi',    amazonBrowseNode: '1715740031' },
  { shopifyHandle: 'sovrumsforvaring',   keywords: 'garderob organizer sovrum förvaring', amazonBrowseNode: '1715754031' },
  { shopifyHandle: 'badrumsforvaring',   keywords: 'badrum duschhylla organizer',         amazonBrowseNode: '1715742031' },
  { shopifyHandle: 'tradgardsforvaring', keywords: 'trädgård förvaringslåda utomhus',     amazonBrowseNode: '1715752031' },
  { shopifyHandle: 'hallforvaring',      keywords: 'hall skoförvaring krokpanel',         amazonBrowseNode: '1715741031' },
  { shopifyHandle: 'kontorsforvaring',   keywords: 'kontor skrivbord organizer hylla',    amazonBrowseNode: '1715751031' }
];

/* ─── Amazon PA-API v5 Signature (AWS4-HMAC-SHA256) ─── */
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function getSigningKey(secret, date, region, service) {
  const kDate    = sign('AWS4' + secret, date);
  const kRegion  = sign(kDate, region);
  const kService = sign(kRegion, service);
  return sign(kService, 'aws4_request');
}

function buildAmazonRequest(keywords, browseNode) {
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const service   = 'ProductAdvertisingAPI';

  const payload = JSON.stringify({
    'Keywords':       keywords,
    'Resources': [
      'Images.Primary.Large',
      'ItemInfo.Title',
      'ItemInfo.Features',
      'Offers.Listings.Price',
      'CustomerReviews.Count',
      'CustomerReviews.StarRating'
    ],
    'SearchIndex':    'All',
    'BrowseNodeId':   browseNode,
    'PartnerTag':     PARTNER_TAG,
    'PartnerType':    'Associates',
    'Marketplace':    'www.amazon.se',
    'ItemCount':      10
  });

  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalHeaders =
    'content-encoding:amz-1.0\n' +
    'content-type:application/json; charset=utf-8\n' +
    'host:' + AMAZON_HOST + '\n' +
    'x-amz-date:' + amzDate + '\n' +
    'x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n';

  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest = [
    'POST', AMAZON_PATH, '',
    canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const credentialScope = [dateStamp, AMAZON_REGION, service, 'aws4_request'].join('/');
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  const signingKey = getSigningKey(AMAZON_SECRET, dateStamp, AMAZON_REGION, service);
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authHeader =
    'AWS4-HMAC-SHA256 Credential=' + AMAZON_ACCESS + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  return {
    hostname: AMAZON_HOST,
    path:     AMAZON_PATH,
    method:   'POST',
    headers: {
      'Content-Encoding': 'amz-1.0',
      'Content-Type':     'application/json; charset=utf-8',
      'Host':             AMAZON_HOST,
      'X-Amz-Date':       amzDate,
      'X-Amz-Target':     'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
      'Authorization':    authHeader,
      'Content-Length':   Buffer.byteLength(payload)
    },
    body: payload
  };
}

/* ─── Generic HTTPS request ─── */
function httpsRequest(options, body) {
  return new Promise(function (resolve, reject) {
    const req = https.request(options, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/* ─── Search Amazon products ─── */
async function searchAmazonProducts(keywords, browseNode) {
  const req = buildAmazonRequest(keywords, browseNode);
  console.log('  📦 Söker Amazon: ' + keywords);
  try {
    const result = await httpsRequest(req, req.body);
    if (!result.SearchResult || !result.SearchResult.Items) return [];
    return result.SearchResult.Items.filter(function (item) {
      const rating  = item.CustomerReviews && item.CustomerReviews.StarRating
        ? parseFloat(item.CustomerReviews.StarRating.Value) : 0;
      const reviews = item.CustomerReviews && item.CustomerReviews.Count
        ? parseInt(item.CustomerReviews.Count, 10) : 0;
      return rating >= MIN_RATING && reviews >= MIN_REVIEWS;
    });
  } catch (err) {
    console.warn('  ⚠️  Amazon-fel:', err.message);
    return [];
  }
}

/* ─── Shopify API helpers ─── */
function shopifyRequest(method, endpoint, body) {
  const payload = body ? JSON.stringify(body) : null;
  const options = {
    hostname: SHOPIFY_STORE,
    path:     '/admin/api/2024-01' + endpoint,
    method:   method,
    headers: {
      'Content-Type':         'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN
    }
  };
  if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
  return httpsRequest(options, payload);
}

async function ensureCollection(handle, title, description) {
  const list = await shopifyRequest('GET', '/custom_collections.json?handle=' + handle);
  if (list.custom_collections && list.custom_collections.length > 0) {
    return list.custom_collections[0].id;
  }
  const res = await shopifyRequest('POST', '/custom_collections.json', {
    custom_collection: { title, handle, body_html: description, published: true }
  });
  if (res.custom_collection) {
    console.log('  ✅ Skapade kollektion: ' + title);
    return res.custom_collection.id;
  }
  throw new Error('Kunde inte skapa kollektion ' + handle);
}

async function createProduct(amazonItem, collectionId) {
  const title       = amazonItem.ItemInfo.Title.DisplayValue;
  const price       = amazonItem.Offers && amazonItem.Offers.Listings && amazonItem.Offers.Listings[0]
    ? amazonItem.Offers.Listings[0].Price.Amount : '0.00';
  const imageUrl    = amazonItem.Images && amazonItem.Images.Primary && amazonItem.Images.Primary.Large
    ? amazonItem.Images.Primary.Large.URL : null;
  const features    = amazonItem.ItemInfo.Features
    ? amazonItem.ItemInfo.Features.DisplayValues : [];
  const description = '<ul>' + features.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>';

  const productPayload = {
    product: {
      title,
      body_html:   description,
      vendor:      'Fixaotrixa',
      product_type: 'Förvaring',
      status:      'active',
      variants: [{
        price:      parseFloat(price).toFixed(2),
        requires_shipping: true,
        taxable:    true
      }]
    }
  };

  if (imageUrl) {
    productPayload.product.images = [{ src: imageUrl }];
  }

  const res = await shopifyRequest('POST', '/products.json', productPayload);
  if (!res.product) throw new Error('Shopify svar saknar produkt');

  /* Add to collection */
  await shopifyRequest('POST', '/collects.json', {
    collect: { product_id: res.product.id, collection_id: collectionId }
  });

  return res.product;
}

/* ─── Main ─── */
async function main() {
  console.log('\n🚀 Fixaotrixa – Amazon Product Importer');
  console.log('  Butik: ' + SHOPIFY_STORE);
  console.log('  Kategorier att importera: ' + CATEGORIES.length + '\n');

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
    console.error('❌  SHOPIFY_STORE_URL och SHOPIFY_ACCESS_TOKEN måste vara satta i .env');
    process.exit(1);
  }
  if (!AMAZON_ACCESS || !AMAZON_SECRET || !PARTNER_TAG) {
    console.error('❌  AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY och AMAZON_PARTNER_TAG måste vara satta i .env');
    process.exit(1);
  }

  let totalImported = 0;

  for (const cat of CATEGORIES) {
    console.log('📂 Kategori: ' + cat.shopifyHandle);
    try {
      const title       = cat.shopifyHandle.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      const collectionId = await ensureCollection(cat.shopifyHandle, title, '');
      const items        = await searchAmazonProducts(cat.keywords, cat.amazonBrowseNode);
      console.log('  Hittade ' + items.length + ' godkända produkter (betyg ≥ ' + MIN_RATING + ', recensioner ≥ ' + MIN_REVIEWS + ')');

      for (const item of items) {
        try {
          const product = await createProduct(item, collectionId);
          console.log('  ✅ Importerad: ' + product.title);
          totalImported++;
          /* Rate limiting – max 2 anrop/sekund mot Shopify */
          await new Promise(function (r) { setTimeout(r, 600); });
        } catch (err) {
          console.warn('  ⚠️  Kunde inte importera produkt:', err.message);
        }
      }
    } catch (err) {
      console.error('  ❌  Fel för kategori ' + cat.shopifyHandle + ':', err.message);
    }
    console.log('');
  }

  console.log('✅ Import klar! Totalt importerade: ' + totalImported + ' produkter.');
}

if (require.main === module) {
  main().catch(function (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

/* ─── Exports (for testing) ─── */
module.exports = {
  sign,
  getSigningKey,
  buildAmazonRequest,
  loadEnv,
  httpsRequest,
  searchAmazonProducts,
  shopifyRequest,
  ensureCollection,
  createProduct,
  CATEGORIES,
  MIN_RATING,
  MIN_REVIEWS
};
