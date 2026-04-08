'use strict';

/**
 * Tests for scripts/amazon-product-importer.js
 *
 * Strategy:
 *  - jest.mock('https') and jest.mock('fs') are hoisted (module-level).
 *  - We get auto-mocked versions and configure them per-test via mockImplementation.
 *  - process.env is set once in beforeAll so the module's top-level constants are
 *    populated when the module is first required.
 */

const crypto = require('crypto');

/* ─── Top-level mocks (hoisted by babel-jest) ───────────────── */
jest.mock('https');
jest.mock('fs');

const https = require('https');
const fs    = require('fs');

/* ─── Env constants ─────────────────────────────────────────── */
const MOCK_ENV = {
  SHOPIFY_STORE_URL:    'test.myshopify.com',
  SHOPIFY_ACCESS_TOKEN: 'shpat_test_token',
  AMAZON_ACCESS_KEY:    'AKIATEST',
  AMAZON_SECRET_KEY:    'secret123',
  AMAZON_PARTNER_TAG:   'fixaotrixa-21',
  AMAZON_REGION:        'eu-west-1'
};

/* Set env BEFORE requiring the module so top-level constants are populated */
Object.assign(process.env, MOCK_ENV);

afterAll(() => { Object.keys(MOCK_ENV).forEach(k => delete process.env[k]); });

/* ─── Require module once (after env is set) ────────────────── */
const importer = require('../scripts/amazon-product-importer');

/* ─── Shared helpers ────────────────────────────────────────── */

/**
 * Set up https.request to return a resolved response with the given body.
 */
function mockHttpsOk(responseData) {
  https.request.mockImplementation((_opts, cb) => {
    const res = { on: jest.fn() };
    res.on.mockImplementation((evt, handler) => {
      if (evt === 'data') handler(JSON.stringify(responseData));
      if (evt === 'end')  handler();
    });
    cb(res);
    return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  });
}

/**
 * Set up https.request to alternate between multiple responses.
 */
function mockHttpsSequential(...responses) {
  let mockCallIndex = 0;
  https.request.mockImplementation((_opts, cb) => {
    const mockData = responses[Math.min(mockCallIndex++, responses.length - 1)];
    const res = { on: jest.fn() };
    res.on.mockImplementation((evt, handler) => {
      if (evt === 'data') handler(JSON.stringify(mockData));
      if (evt === 'end')  handler();
    });
    cb(res);
    return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  });
}

/**
 * Set up https.request to emit a network error.
 */
function mockHttpsError(message) {
  https.request.mockImplementation((_opts, _cb) => {
    const req = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    req.on.mockImplementation((evt, handler) => {
      if (evt === 'error') handler(new Error(message));
    });
    return req;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

/* ════════════════════════════════════════════════════
   1.  loadEnv
════════════════════════════════════════════════════ */
describe('loadEnv', () => {
  afterEach(() => {
    ['FOO', 'BAZ', 'QUOTED_SINGLE', 'QUOTED_DOUBLE', 'VALID_KEY', 'EXISTING_VAR']
      .forEach(k => delete process.env[k]);
  });

  it('reads and parses a well-formed .env file', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('FOO=bar\nBAZ=qux\n');

    importer.loadEnv();
    expect(process.env.FOO).toBe('bar');
    expect(process.env.BAZ).toBe('qux');
  });

  it('strips surrounding single and double quotes from values', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("QUOTED_SINGLE='hello'\nQUOTED_DOUBLE=\"world\"\n");

    importer.loadEnv();
    expect(process.env.QUOTED_SINGLE).toBe('hello');
    expect(process.env.QUOTED_DOUBLE).toBe('world');
  });

  it('skips comment lines and blank lines', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('# comment\n\nVALID_KEY=valid\n');

    importer.loadEnv();
    expect(process.env.VALID_KEY).toBe('valid');
  });

  it('does not override an already-set env var', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('EXISTING_VAR=new\n');
    process.env.EXISTING_VAR = 'original';

    importer.loadEnv();
    expect(process.env.EXISTING_VAR).toBe('original');
  });

  it('calls process.exit(1) when .env file is missing', () => {
    fs.existsSync.mockReturnValue(false);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    importer.loadEnv();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

/* ════════════════════════════════════════════════════
   2.  sign / getSigningKey
════════════════════════════════════════════════════ */
describe('sign', () => {
  it('produces the expected HMAC-SHA256 for a string key', () => {
    const result   = importer.sign('mysecret', 'mymessage');
    const expected = crypto.createHmac('sha256', 'mysecret').update('mymessage', 'utf8').digest();
    expect(result).toEqual(expected);
  });

  it('produces the expected HMAC-SHA256 for a Buffer key', () => {
    const bufKey   = Buffer.from('bufferkey');
    const result   = importer.sign(bufKey, 'msg');
    const expected = crypto.createHmac('sha256', bufKey).update('msg', 'utf8').digest();
    expect(result).toEqual(expected);
  });
});

describe('getSigningKey', () => {
  it('returns a 32-byte Buffer', () => {
    const key = importer.getSigningKey('secret', '20240101', 'eu-west-1', 'ProductAdvertisingAPI');
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it('is deterministic for the same inputs', () => {
    const k1 = importer.getSigningKey('s', '20240101', 'eu-west-1', 'ProductAdvertisingAPI');
    const k2 = importer.getSigningKey('s', '20240101', 'eu-west-1', 'ProductAdvertisingAPI');
    expect(k1).toEqual(k2);
  });

  it('differs when the secret changes', () => {
    const k1 = importer.getSigningKey('secretA', '20240101', 'eu-west-1', 'ProductAdvertisingAPI');
    const k2 = importer.getSigningKey('secretB', '20240101', 'eu-west-1', 'ProductAdvertisingAPI');
    expect(k1).not.toEqual(k2);
  });

  it('differs when the date changes', () => {
    const k1 = importer.getSigningKey('secret', '20240101', 'eu-west-1', 'ProductAdvertisingAPI');
    const k2 = importer.getSigningKey('secret', '20240102', 'eu-west-1', 'ProductAdvertisingAPI');
    expect(k1).not.toEqual(k2);
  });
});

/* ════════════════════════════════════════════════════
   3.  buildAmazonRequest
════════════════════════════════════════════════════ */
describe('buildAmazonRequest', () => {
  it('returns hostname, path, method, headers and body', () => {
    const req = importer.buildAmazonRequest('köksförvaring', '1715740031');
    expect(req.hostname).toBe('webservices.amazon.se');
    expect(req.path).toBe('/paapi5/searchitems');
    expect(req.method).toBe('POST');
    expect(typeof req.body).toBe('string');
  });

  it('includes all required signed headers', () => {
    const req = importer.buildAmazonRequest('test', '12345');
    expect(req.headers['Content-Encoding']).toBe('amz-1.0');
    expect(req.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(req.headers['X-Amz-Target']).toBe(
      'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems'
    );
    expect(req.headers['Authorization']).toMatch(/^AWS4-HMAC-SHA256/);
    expect(req.headers['X-Amz-Date']).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it('embeds partner tag and browse node in the JSON payload', () => {
    const req     = importer.buildAmazonRequest('organizer', '99999');
    const payload = JSON.parse(req.body);
    expect(payload.PartnerTag).toBe(MOCK_ENV.AMAZON_PARTNER_TAG);
    expect(payload.BrowseNodeId).toBe('99999');
    expect(payload.Keywords).toBe('organizer');
    expect(payload.Marketplace).toBe('www.amazon.se');
    expect(payload.ItemCount).toBe(10);
  });

  it('Content-Length header matches the byte length of the body', () => {
    const req = importer.buildAmazonRequest('test', '111');
    expect(req.headers['Content-Length']).toBe(Buffer.byteLength(req.body));
  });

  it('includes all required resource fields in the payload', () => {
    const req     = importer.buildAmazonRequest('test', '123');
    const payload = JSON.parse(req.body);
    expect(payload.Resources).toContain('Images.Primary.Large');
    expect(payload.Resources).toContain('ItemInfo.Title');
    expect(payload.Resources).toContain('Offers.Listings.Price');
    expect(payload.Resources).toContain('CustomerReviews.StarRating');
  });
});

/* ════════════════════════════════════════════════════
   4.  httpsRequest
════════════════════════════════════════════════════ */
describe('httpsRequest', () => {
  const opts = { hostname: 'example.com', path: '/', method: 'GET', headers: {} };

  it('resolves with parsed JSON on a successful response', async () => {
    const responseData = { SearchResult: { Items: [] } };
    mockHttpsOk(responseData);

    const result = await importer.httpsRequest(opts);
    expect(result).toEqual(responseData);
  });

  it('rejects when the response body is not valid JSON', async () => {
    https.request.mockImplementation((_opts, cb) => {
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler('not-json');
        if (evt === 'end')  handler();
      });
      cb(res);
      return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    await expect(importer.httpsRequest(opts)).rejects.toThrow('JSON parse error');
  });

  it('rejects when the request emits an error event', async () => {
    mockHttpsError('network failure');
    await expect(importer.httpsRequest(opts)).rejects.toThrow('network failure');
  });

  it('calls req.write when a body string is provided', async () => {
    const mockWriteCall = jest.fn();
    https.request.mockImplementation((_opts, cb) => {
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler('{}');
        if (evt === 'end')  handler();
      });
      cb(res);
      return { on: jest.fn(), write: mockWriteCall, end: jest.fn() };
    });

    await importer.httpsRequest({ ...opts, method: 'POST' }, '{"key":"value"}');
    expect(mockWriteCall).toHaveBeenCalledWith('{"key":"value"}');
  });

  it('does NOT call req.write when no body is given', async () => {
    const mockNoWrite = jest.fn();
    https.request.mockImplementation((_opts, cb) => {
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler('{}');
        if (evt === 'end')  handler();
      });
      cb(res);
      return { on: jest.fn(), write: mockNoWrite, end: jest.fn() };
    });

    await importer.httpsRequest(opts);
    expect(mockNoWrite).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════
   5.  searchAmazonProducts
════════════════════════════════════════════════════ */
describe('searchAmazonProducts', () => {
  function makeItem(rating, reviews) {
    return {
      CustomerReviews: {
        StarRating: { Value: String(rating) },
        Count:      reviews
      },
      ItemInfo: { Title: { DisplayValue: 'Test Product' } }
    };
  }

  it('returns only items meeting rating AND review thresholds', async () => {
    const goodItem = makeItem(4.5, 100);
    const lowRate  = makeItem(3.9, 100);
    const fewRevs  = makeItem(4.5, 10);

    mockHttpsOk({ SearchResult: { Items: [goodItem, lowRate, fewRevs] } });
    const result = await importer.searchAmazonProducts('test', '123');
    expect(result).toHaveLength(1);
    expect(result[0]).toStrictEqual(goodItem);
  });

  it('returns [] when SearchResult is absent from the response', async () => {
    mockHttpsOk({});
    expect(await importer.searchAmazonProducts('test', '123')).toEqual([]);
  });

  it('returns [] when Items list is absent', async () => {
    mockHttpsOk({ SearchResult: {} });
    expect(await importer.searchAmazonProducts('test', '123')).toEqual([]);
  });

  it('returns [] and logs a warning on network error', async () => {
    mockHttpsError('timeout');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result  = await importer.searchAmazonProducts('test', '123');
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('treats missing CustomerReviews as 0 rating / 0 reviews (below threshold)', async () => {
    const bareItem = { ItemInfo: { Title: { DisplayValue: 'Bare product' } } };
    mockHttpsOk({ SearchResult: { Items: [bareItem] } });
    const result = await importer.searchAmazonProducts('test', '123');
    expect(result).toHaveLength(0);
  });

  it('includes an item with exactly the minimum rating and reviews', async () => {
    const borderItem = makeItem(
      importer.MIN_RATING,
      importer.MIN_REVIEWS
    );
    mockHttpsOk({ SearchResult: { Items: [borderItem] } });
    const result = await importer.searchAmazonProducts('test', '123');
    expect(result).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════
   6.  shopifyRequest
════════════════════════════════════════════════════ */
describe('shopifyRequest', () => {
  it('sends to the correct Shopify REST path with auth headers', async () => {
    const mockOptions = [];
    https.request.mockImplementation((opts, cb) => {
      mockOptions.push(opts);
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler('{}');
        if (evt === 'end')  handler();
      });
      cb(res);
      return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    await importer.shopifyRequest('GET', '/products.json');

    expect(mockOptions[0].hostname).toBe(MOCK_ENV.SHOPIFY_STORE_URL);
    expect(mockOptions[0].path).toBe('/admin/api/2024-01/products.json');
    expect(mockOptions[0].headers['X-Shopify-Access-Token']).toBe(MOCK_ENV.SHOPIFY_ACCESS_TOKEN);
  });

  it('sets Content-Length for POST requests', async () => {
    const mockOptions = [];
    https.request.mockImplementation((opts, cb) => {
      mockOptions.push(opts);
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler('{}');
        if (evt === 'end')  handler();
      });
      cb(res);
      return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    await importer.shopifyRequest('POST', '/products.json', { product: { title: 'Test' } });
    expect(mockOptions[0].headers['Content-Length']).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════
   7.  ensureCollection
════════════════════════════════════════════════════ */
describe('ensureCollection', () => {
  it('returns the existing collection id when one is found', async () => {
    mockHttpsSequential(
      { custom_collections: [{ id: 42, title: 'Existing' }] }
    );
    const id = await importer.ensureCollection('koksforvaring', 'Köksförvaring', '');
    expect(id).toBe(42);
  });

  it('creates a new collection when none exists and returns the new id', async () => {
    mockHttpsSequential(
      { custom_collections: [] },
      { custom_collection: { id: 99, title: 'New' } }
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const id = await importer.ensureCollection('koksforvaring', 'Köksförvaring', 'desc');
    expect(id).toBe(99);
    logSpy.mockRestore();
  });

  it('throws with a helpful message when the POST response lacks custom_collection', async () => {
    mockHttpsSequential(
      { custom_collections: [] },
      { error: 'bad' }
    );
    await expect(importer.ensureCollection('bad', 'Bad', ''))
      .rejects.toThrow('Kunde inte skapa kollektion bad');
  });
});

/* ════════════════════════════════════════════════════
   8.  createProduct
════════════════════════════════════════════════════ */
describe('createProduct', () => {
  const baseItem = {
    ItemInfo: {
      Title:    { DisplayValue: 'Test Shelf' },
      Features: { DisplayValues: ['Feature A', 'Feature B'] }
    },
    Offers: { Listings: [{ Price: { Amount: '299.00' } }] },
    Images: { Primary: { Large: { URL: 'https://example.com/img.jpg' } } }
  };

  it('creates a product and returns it', async () => {
    mockHttpsSequential(
      { product: { id: 1, title: 'Test Shelf' } }, // POST /products
      { collect: { id: 55 } }                        // POST /collects
    );
    const product = await importer.createProduct(baseItem, 10);
    expect(product.id).toBe(1);
    expect(product.title).toBe('Test Shelf');
  });

  it('includes feature list as HTML in body_html', async () => {
    const mockWrittenBodies = [];
    let mockSeqIdx = 0;
    const mockSeqData = [
      { product: { id: 2, title: 'T' } },
      { collect: {} }
    ];
    https.request.mockImplementation((_opts, cb) => {
      const mockSeqItem = mockSeqData[Math.min(mockSeqIdx++, 1)];
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler(JSON.stringify(mockSeqItem));
        if (evt === 'end')  handler();
      });
      cb(res);
      const req = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      req.write.mockImplementation(b => mockWrittenBodies.push(b));
      return req;
    });

    await importer.createProduct(baseItem, 10);
    const payload = JSON.parse(mockWrittenBodies[0]);
    expect(payload.product.body_html).toContain('<li>Feature A</li>');
    expect(payload.product.body_html).toContain('<li>Feature B</li>');
  });

  it('omits images when Primary.Large.URL is absent', async () => {
    const mockWrittenBodies = [];
    let mockNoImgIdx = 0;
    const mockNoImgData = [{ product: { id: 3, title: 'T' } }, { collect: {} }];
    https.request.mockImplementation((_opts, cb) => {
      const mockNoImgItem = mockNoImgData[Math.min(mockNoImgIdx++, 1)];
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler(JSON.stringify(mockNoImgItem));
        if (evt === 'end')  handler();
      });
      cb(res);
      const req = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      req.write.mockImplementation(b => mockWrittenBodies.push(b));
      return req;
    });

    await importer.createProduct({ ...baseItem, Images: null }, 10);
    const payload = JSON.parse(mockWrittenBodies[0]);
    expect(payload.product.images).toBeUndefined();
  });

  it('defaults price to "0.00" when Offers are absent', async () => {
    const mockWrittenBodies = [];
    let mockNoPriceIdx = 0;
    const mockNoPriceData = [{ product: { id: 4, title: 'T' } }, { collect: {} }];
    https.request.mockImplementation((_opts, cb) => {
      const mockNoPriceItem = mockNoPriceData[Math.min(mockNoPriceIdx++, 1)];
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler(JSON.stringify(mockNoPriceItem));
        if (evt === 'end')  handler();
      });
      cb(res);
      const req = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      req.write.mockImplementation(b => mockWrittenBodies.push(b));
      return req;
    });

    await importer.createProduct({ ...baseItem, Offers: null }, 10);
    const payload = JSON.parse(mockWrittenBodies[0]);
    expect(payload.product.variants[0].price).toBe('0.00');
  });

  it('throws when the Shopify response is missing the product key', async () => {
    mockHttpsOk({ error: 'unprocessable' });
    await expect(importer.createProduct(baseItem, 10))
      .rejects.toThrow('Shopify svar saknar produkt');
  });

  it('sets vendor to "Fixaotrixa" and product_type to "Förvaring"', async () => {
    const mockWrittenBodies = [];
    let mockVendorIdx = 0;
    const mockVendorData = [{ product: { id: 5, title: 'T' } }, { collect: {} }];
    https.request.mockImplementation((_opts, cb) => {
      const mockVendorItem = mockVendorData[Math.min(mockVendorIdx++, 1)];
      const res = { on: jest.fn() };
      res.on.mockImplementation((evt, handler) => {
        if (evt === 'data') handler(JSON.stringify(mockVendorItem));
        if (evt === 'end')  handler();
      });
      cb(res);
      const req = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      req.write.mockImplementation(b => mockWrittenBodies.push(b));
      return req;
    });

    await importer.createProduct(baseItem, 10);
    const payload = JSON.parse(mockWrittenBodies[0]);
    expect(payload.product.vendor).toBe('Fixaotrixa');
    expect(payload.product.product_type).toBe('Förvaring');
    expect(payload.product.status).toBe('active');
  });
});

/* ════════════════════════════════════════════════════
   9.  Module metadata
════════════════════════════════════════════════════ */
describe('module metadata', () => {
  it('exports exactly 6 categories', () => {
    expect(importer.CATEGORIES).toHaveLength(6);
  });

  it('exports MIN_RATING of 4.0', () => {
    expect(importer.MIN_RATING).toBe(4.0);
  });

  it('exports MIN_REVIEWS of 50', () => {
    expect(importer.MIN_REVIEWS).toBe(50);
  });

  it('every category has shopifyHandle, keywords, and amazonBrowseNode', () => {
    importer.CATEGORIES.forEach(cat => {
      expect(cat).toHaveProperty('shopifyHandle');
      expect(cat).toHaveProperty('keywords');
      expect(cat).toHaveProperty('amazonBrowseNode');
    });
  });

  it('all shopifyHandles are non-empty strings', () => {
    importer.CATEGORIES.forEach(cat => {
      expect(typeof cat.shopifyHandle).toBe('string');
      expect(cat.shopifyHandle.length).toBeGreaterThan(0);
    });
  });
});
