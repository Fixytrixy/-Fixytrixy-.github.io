/**
 * @jest-environment jsdom
 *
 * Tests for assets/fixaotrixa-home.js
 */

'use strict';

/* ─── Flush pending promise microtasks ──────────────────────── */
async function flushPromises() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

/* ─── HTML fixture ──────────────────────────────────────────── */
function buildHomeHtml() {
  return `
    <body data-template="product">

      <!-- Add-to-cart form (variant select is INSIDE the form) -->
      <form data-type="add-to-cart-form">
        <input type="hidden" name="id" value="123456">
        <input type="number" name="quantity" value="1">
        <select class="product-form__option-select" name="options[Color]">
          <option value="Röd">Röd</option>
          <option value="Blå">Blå</option>
        </select>
        <button name="add"><span>Lägg i varukorg</span></button>
      </form>

      <!-- Cart count badge -->
      <span data-cart-count aria-label="0 produkter i kundvagnen">0</span>
      <span data-cart-count>0</span>

      <!-- Product page price / title -->
      <h1 class="product-page__title">Testprodukt</h1>
      <span class="product-page__price-current">299,00 kr</span>

      <!-- Exit-intent popup -->
      <div id="exit-intent-popup" style="display:none" aria-hidden="true">
        <div class="exit-popup__overlay"></div>
        <button class="exit-popup__close">×</button>
        <form id="exit-popup-form">
          <input type="email" placeholder="din@email.se">
          <button type="submit">Prenumerera</button>
        </form>
      </div>

      <!-- Lazy image -->
      <img loading="lazy" data-src="https://example.com/product.jpg" src="">

      <!-- Anchor link for smooth scroll -->
      <a href="#anchor-target">Scroll to section</a>
      <div id="anchor-target">Target section</div>

    </body>
  `;
}

/* ─── Helpers ───────────────────────────────────────────────── */
function makeFetchOk(json) {
  return jest.fn().mockResolvedValue({
    ok:   true,
    json: () => Promise.resolve(json)
  });
}

function loadHome() {
  jest.resetModules();
  require('../assets/fixaotrixa-home.js');
}

/* ════════════════════════════════════════════════════
   Outer setup
════════════════════════════════════════════════════ */
beforeEach(() => {
  sessionStorage.clear();
  global.fetch = makeFetchOk({ item_count: 0 });
  document.body.innerHTML = buildHomeHtml();
  loadHome();
});

afterEach(() => {
  delete global.gtag;
  delete global._learnq;
  delete global.productVariants;
  delete global.routes;
});

/* ════════════════════════════════════════════════════
   1.  updateCartCount
════════════════════════════════════════════════════ */
describe('updateCartCount', () => {
  it('calls fetch /cart.js on load', () => {
    const cartCall = global.fetch.mock.calls.find(c => c[0] === '/cart.js');
    expect(cartCall).toBeDefined();
  });

  it('updates [data-cart-count] elements after resolving', async () => {
    global.fetch = makeFetchOk({ item_count: 7 });
    loadHome();
    await flushPromises();

    const badges = document.querySelectorAll('[data-cart-count]');
    badges.forEach(b => expect(b.textContent).toBe('7'));
  });

  it('updates aria-label on [data-cart-count] elements', async () => {
    global.fetch = makeFetchOk({ item_count: 5 });
    loadHome();
    await flushPromises();

    const badge = document.querySelector('[data-cart-count][aria-label]');
    expect(badge.getAttribute('aria-label')).toBe('5 produkter i kundvagnen');
  });

  it('does not throw when /cart.js fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    expect(() => loadHome()).not.toThrow();
    await flushPromises();
  });
});

/* ════════════════════════════════════════════════════
   2.  Add-to-cart form
════════════════════════════════════════════════════ */
describe('add-to-cart form', () => {
  // A fetch that returns a successful cart-add response for any URL
  function cartAddFetch(item) {
    return jest.fn(url => {
      if (url === '/cart.js') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item_count: 0 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(item) });
    });
  }

  it('prevents default form submission', () => {
    const form  = document.querySelector('[data-type="add-to-cart-form"]');
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('disables button and shows loading text while pending', () => {
    const form = document.querySelector('[data-type="add-to-cart-form"]');
    const btn  = form.querySelector('[name="add"]');

    global.fetch = jest.fn(url => {
      if (url === '/cart.js') return Promise.resolve({ ok: true, json: () => Promise.resolve({ item_count: 0 }) });
      return new Promise(() => {}); // never resolves – keeps pending
    });
    loadHome();

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(btn.disabled).toBe(true);
    expect(btn.innerHTML).toContain('Lägger till');
  });

  it('shows success text and green background after adding', async () => {
    const item = { id: 1, title: 'T', price: 29900, quantity: 1, currency: 'SEK', vendor: 'V' };
    global.fetch = cartAddFetch(item);
    loadHome();

    const form = document.querySelector('[data-type="add-to-cart-form"]');
    const btn  = form.querySelector('[name="add"]');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(btn.innerHTML).toContain('Tillagd');
    expect(btn.style.background).toBe('rgb(56, 142, 60)');
  });

  it('restores button after 2 s timeout', async () => {
    jest.useFakeTimers();
    const item = { id: 1, title: 'T', price: 100, quantity: 1, currency: 'SEK', vendor: 'V' };
    global.fetch = cartAddFetch(item);
    loadHome();

    const form         = document.querySelector('[data-type="add-to-cart-form"]');
    const btn          = form.querySelector('[name="add"]');
    const originalText = btn.innerHTML;

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    jest.advanceTimersByTime(2001);
    await flushPromises();

    expect(btn.disabled).toBe(false);
    expect(btn.innerHTML).toBe(originalText);
    jest.useRealTimers();
  });

  it('restores button on non-ok response', async () => {
    global.fetch = jest.fn(url => {
      if (url === '/cart.js') return Promise.resolve({ ok: true, json: () => Promise.resolve({ item_count: 0 }) });
      return Promise.resolve({ ok: false });
    });
    loadHome();

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const form   = document.querySelector('[data-type="add-to-cart-form"]');
    const btn    = form.querySelector('[name="add"]');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(btn.disabled).toBe(false);
    errSpy.mockRestore();
  });

  it('does not submit when the add button is already disabled', () => {
    const form = document.querySelector('[data-type="add-to-cart-form"]');
    const btn  = form.querySelector('[name="add"]');
    btn.disabled = true;

    const before = global.fetch.mock.calls.length;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(global.fetch.mock.calls.length).toBe(before); // no new fetch
  });

  it('fires a gtag add_to_cart event on success', async () => {
    const gtagMock = jest.fn();
    global.gtag = gtagMock;

    const item = { id: 1, title: 'Hylla', price: 49900, quantity: 2, currency: 'SEK', vendor: 'V' };
    global.fetch = cartAddFetch(item);
    loadHome();

    const form = document.querySelector('[data-type="add-to-cart-form"]');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    const addCall = gtagMock.mock.calls.find(c => c[1] === 'add_to_cart');
    expect(addCall).toBeDefined();
    expect(addCall[2].currency).toBe('SEK');
    expect(addCall[2].items[0].item_name).toBe('Hylla');
    expect(addCall[2].value).toBe(499);
  });

  it('does not throw when gtag is undefined during add_to_cart', async () => {
    delete global.gtag;
    const item = { id: 1, title: 'T', price: 100, quantity: 1, currency: 'SEK', vendor: 'V' };
    global.fetch = cartAddFetch(item);
    loadHome();

    const form = document.querySelector('[data-type="add-to-cart-form"]');
    await expect(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushPromises();
    }).not.toThrow();
  });

  it('uses /cart/add.js when window.routes is not defined', () => {
    delete global.routes;
    loadHome();
    const form = document.querySelector('[data-type="add-to-cart-form"]');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(global.fetch).toHaveBeenCalledWith('/cart/add.js', expect.any(Object));
  });

  it('uses window.routes.cart_add_url when defined', () => {
    global.routes = { cart_add_url: '/cart/add' };
    loadHome();
    const form = document.querySelector('[data-type="add-to-cart-form"]');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(global.fetch).toHaveBeenCalledWith('/cart/add', expect.any(Object));
  });
});

/* ════════════════════════════════════════════════════
   3.  Exit-intent popup
════════════════════════════════════════════════════ */
describe('exit-intent popup', () => {
  function triggerMouseLeave(clientY) {
    document.dispatchEvent(new MouseEvent('mouseleave', {
      clientY: clientY !== undefined ? clientY : 0,
      bubbles: true
    }));
  }

  it('shows popup on mouseleave when clientY === 0', () => {
    const popup = document.getElementById('exit-intent-popup');
    triggerMouseLeave(0);
    expect(popup.style.display).toBe('flex');
  });

  it('removes aria-hidden when popup is shown', () => {
    const popup = document.getElementById('exit-intent-popup');
    triggerMouseLeave(0);
    expect(popup.hasAttribute('aria-hidden')).toBe(false);
  });

  it('sets sessionStorage key when popup is first shown', () => {
    triggerMouseLeave(0);
    expect(sessionStorage.getItem('fxa_exit_shown')).toBe('1');
  });

  it('does not re-show popup after hasShown flag is set (same module instance)', () => {
    const popup = document.getElementById('exit-intent-popup');
    triggerMouseLeave(0);           // first show
    popup.style.display = 'none';   // simulate manual close
    triggerMouseLeave(0);           // second trigger
    // hasShown flag in the same module instance prevents a second show
    expect(popup.style.display).toBe('none');
  });

  it('does not attach mouseleave listener when session key is already set', () => {
    sessionStorage.setItem('fxa_exit_shown', '1');
    document.body.innerHTML = buildHomeHtml();

    const spy = jest.spyOn(document, 'addEventListener');
    loadHome(); // session key is set → no mouseleave listener should be added

    const mouseleaveCalls = spy.mock.calls.filter(c => c[0] === 'mouseleave');
    expect(mouseleaveCalls).toHaveLength(0);
    spy.mockRestore();
  });

  it('does not show popup when clientY > 0', () => {
    const popup = document.getElementById('exit-intent-popup');
    triggerMouseLeave(50);
    expect(popup.style.display).not.toBe('flex');
  });

  it('closes popup when close button is clicked', () => {
    const popup    = document.getElementById('exit-intent-popup');
    const closeBtn = popup.querySelector('.exit-popup__close');
    triggerMouseLeave(0);
    closeBtn.click();
    expect(popup.style.display).toBe('none');
    expect(popup.getAttribute('aria-hidden')).toBe('true');
  });

  it('closes popup when overlay is clicked', () => {
    const popup   = document.getElementById('exit-intent-popup');
    const overlay = popup.querySelector('.exit-popup__overlay');
    triggerMouseLeave(0);
    overlay.click();
    expect(popup.style.display).toBe('none');
  });

  it('closes popup when Escape key is pressed', () => {
    const popup = document.getElementById('exit-intent-popup');
    triggerMouseLeave(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popup.style.display).toBe('none');
  });

  it('does not close popup on non-Escape key', () => {
    const popup = document.getElementById('exit-intent-popup');
    triggerMouseLeave(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(popup.style.display).toBe('flex');
  });
});

/* ════════════════════════════════════════════════════
   4.  Exit-popup email form
════════════════════════════════════════════════════ */
describe('exit-popup email form', () => {
  function triggerPopup() {
    document.dispatchEvent(new MouseEvent('mouseleave', { clientY: 0, bubbles: true }));
  }

  function submitEmail(email) {
    triggerPopup();
    const form  = document.getElementById('exit-popup-form');
    form.querySelector('input[type="email"]').value = email;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('closes popup after form submit', () => {
    submitEmail('test@example.com');
    expect(document.getElementById('exit-intent-popup').style.display).toBe('none');
  });

  it('calls window._learnq.push with identify payload', () => {
    const pushMock = jest.fn();
    global._learnq = { push: pushMock };
    submitEmail('test@example.com');
    expect(pushMock).toHaveBeenCalledWith(['identify', { '$email': 'test@example.com' }]);
  });

  it('fires gtag generate_lead event', () => {
    const gtagMock = jest.fn();
    global.gtag = gtagMock;
    submitEmail('user@test.com');
    expect(gtagMock).toHaveBeenCalledWith('event', 'generate_lead', { value: 1, currency: 'SEK' });
  });

  it('does not throw when _learnq and gtag are absent', () => {
    expect(() => submitEmail('silent@test.com')).not.toThrow();
  });

  it('does nothing when email is empty', () => {
    const pushMock = jest.fn();
    global._learnq = { push: pushMock };
    submitEmail('');
    expect(pushMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════
   5.  GA4 view_item
════════════════════════════════════════════════════ */
describe('GA4 view_item', () => {
  it('fires view_item on a product template page when gtag is defined', () => {
    const gtagMock = jest.fn();
    global.gtag = gtagMock;
    document.body.dataset.template = 'product';
    loadHome();

    const viewCall = gtagMock.mock.calls.find(c => c[1] === 'view_item');
    expect(viewCall).toBeDefined();
    expect(viewCall[2].items[0].item_name).toBe('Testprodukt');
  });

  it('does not fire view_item when template is not "product"', () => {
    const gtagMock = jest.fn();
    global.gtag = gtagMock;
    document.body.dataset.template = 'collection';
    loadHome();

    expect(gtagMock.mock.calls.find(c => c[1] === 'view_item')).toBeUndefined();
  });

  it('does not throw when gtag is undefined', () => {
    delete global.gtag;
    document.body.dataset.template = 'product';
    expect(() => loadHome()).not.toThrow();
  });
});

/* ════════════════════════════════════════════════════
   6.  Smooth scroll
════════════════════════════════════════════════════ */
describe('smooth scroll', () => {
  it('calls scrollIntoView on the target when an anchor link is clicked', () => {
    const target = document.getElementById('anchor-target');
    target.scrollIntoView = jest.fn();
    document.querySelector('a[href="#anchor-target"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('prevents default link navigation for known anchor links', () => {
    document.getElementById('anchor-target').scrollIntoView = jest.fn();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a[href="#anchor-target"]').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prevent default when target element does not exist', () => {
    const dangling = document.createElement('a');
    dangling.href  = '#nonexistent';
    document.body.appendChild(dangling);
    loadHome(); // re-register listeners for new anchor

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    dangling.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

/* ════════════════════════════════════════════════════
   7.  Variant selection – updateVariantId
════════════════════════════════════════════════════ */
describe('updateVariantId', () => {
  beforeEach(() => {
    global.productVariants = [
      { id: 111, options: ['Röd'], price: 29900, available: true  },
      { id: 222, options: ['Blå'], price: 39900, available: false }
    ];
    loadHome();
  });

  function changeSelectTo(value) {
    const select = document.querySelector('.product-form__option-select');
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select;
  }

  it('updates the hidden id input to the matched variant id', () => {
    changeSelectTo('Röd');
    expect(document.querySelector('[name="id"]').value).toBe('111');
  });

  it('disables the add button for an unavailable variant', () => {
    changeSelectTo('Blå');
    expect(document.querySelector('[name="add"]').disabled).toBe(true);
  });

  it('shows "Slutsåld" text for an unavailable variant', () => {
    changeSelectTo('Blå');
    expect(document.querySelector('[name="add"] span').textContent).toBe('Slutsåld');
  });

  it('enables the add button when switching back to an available variant', () => {
    changeSelectTo('Blå');
    changeSelectTo('Röd');
    expect(document.querySelector('[name="add"]').disabled).toBe(false);
  });

  it('shows "Lägg i varukorg" text for an available variant', () => {
    changeSelectTo('Blå');
    changeSelectTo('Röd');
    expect(document.querySelector('[name="add"] span').textContent).toBe('Lägg i varukorg');
  });

  it('updates the displayed price when a variant is selected', () => {
    changeSelectTo('Röd');
    const priceEl = document.querySelector('.product-page__price-current');
    expect(priceEl.textContent).toContain('299');
  });

  it('does not throw when productVariants is not defined', () => {
    delete global.productVariants;
    loadHome();
    expect(() => changeSelectTo('Röd')).not.toThrow();
  });

  it('does not throw when no add-to-cart form exists', () => {
    document.querySelector('[data-type="add-to-cart-form"]').remove();
    loadHome();
    // No form → function returns early; dispatching change should not crash
    const select = document.querySelector('.product-form__option-select');
    expect(() => select && select.dispatchEvent(new Event('change', { bubbles: true }))).not.toThrow();
  });
});

/* ════════════════════════════════════════════════════
   8.  IntersectionObserver lazy-load images
════════════════════════════════════════════════════ */
describe('IntersectionObserver lazy-loading', () => {
  let observeSpy, unobserveSpy, mockObserverCallback;

  beforeEach(() => {
    observeSpy   = jest.fn();
    unobserveSpy = jest.fn();

    // Minimal IntersectionObserver stub
    global.IntersectionObserver = jest.fn(function (callback, _opts) {
      mockObserverCallback = callback;
      this.observe   = observeSpy;
      this.unobserve = unobserveSpy;
    });

    // Re-load with the stub in place
    loadHome();
  });

  afterEach(() => {
    delete global.IntersectionObserver;
  });

  it('calls observe() for each lazy image found in the DOM', () => {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    expect(observeSpy).toHaveBeenCalledTimes(lazyImages.length);
  });

  it('copies data-src to src when the image intersects', () => {
    const img = document.querySelector('img[loading="lazy"]');
    expect(img.getAttribute('src')).toBe(''); // initially empty attribute

    // Simulate IntersectionObserver firing with isIntersecting = true
    mockObserverCallback([{ isIntersecting: true, target: img }]);

    expect(img.src).toBe('https://example.com/product.jpg');
    expect(img.hasAttribute('data-src')).toBe(false);
  });

  it('calls unobserve after loading the image', () => {
    const img = document.querySelector('img[loading="lazy"]');
    mockObserverCallback([{ isIntersecting: true, target: img }]);
    expect(unobserveSpy).toHaveBeenCalledWith(img);
  });

  it('does not change src when entry is not intersecting', () => {
    const img = document.querySelector('img[loading="lazy"]');
    mockObserverCallback([{ isIntersecting: false, target: img }]);
    expect(img.getAttribute('src')).toBe(''); // still empty
  });

  it('does not change src when data-src is absent', () => {
    const img = document.querySelector('img[loading="lazy"]');
    img.removeAttribute('data-src');
    mockObserverCallback([{ isIntersecting: true, target: img }]);
    expect(img.getAttribute('src')).toBe(''); // still empty
  });
});
