/**
 * @jest-environment jsdom
 *
 * Tests for assets/product-ui.js
 *
 * The IIFE executes on require, so we build the DOM first, then require
 * the module.  jest.resetModules() in beforeEach gives a fresh instance
 * per test.
 */

'use strict';

/* ─── HTML fixtures ─────────────────────────────────────── */
function buildProductHtml({ qty, managed, policy } = {}) {
  return `
    <div class="product-page">
      <form class="product-form">
        <select id="variant-select">
          <option
            value="111"
            selected
            data-inventory-qty="${qty !== undefined ? qty : 3}"
            data-inventory-managed="${managed !== undefined ? managed : 'true'}"
            data-inventory-policy="${policy || 'deny'}"
          >
            Default Title – 299,00 kr
          </option>
          <option
            value="222"
            data-inventory-qty="10"
            data-inventory-managed="true"
            data-inventory-policy="deny"
          >
            Stor – 399,00 kr
          </option>
        </select>
        <button type="submit" class="add-to-cart-btn">Lägg i kundvagn</button>
      </form>
    </div>

    <div
      id="sticky-buy-bar"
      class="sticky-buy-bar"
      aria-hidden="true"
    >
      <div class="sticky-buy-bar__inner">
        <div class="sticky-buy-bar__info">
          <span class="sticky-buy-bar__title">Testprodukt</span>
          <span class="sticky-buy-bar__price">299,00 kr</span>
        </div>
        <button type="button" id="sticky-buy-bar-btn">Köp nu</button>
      </div>
    </div>

    <div
      class="urgency-badge"
      data-inventory="3"
    >
      <span class="urgency-badge__icon">⚡</span>
      <span class="urgency-badge__text">Bara <strong>3</strong> kvar i lager!</span>
      <div
        class="urgency-badge__bar"
        role="progressbar"
        aria-valuenow="3"
        aria-valuemin="0"
        aria-valuemax="5"
      >
        <div class="urgency-badge__bar-fill" style="width:60%"></div>
      </div>
    </div>
  `;
}

/* ─── Helper ────────────────────────────────────────────── */
function loadModule() {
  jest.resetModules();
  require('../assets/product-ui.js');
}

/* ════════════════════════════════════════════════════
   Setup / teardown
════════════════════════════════════════════════════ */
beforeEach(() => {
  document.body.innerHTML = buildProductHtml();
  loadModule();
});

/* ════════════════════════════════════════════════════
   1.  Module safety
════════════════════════════════════════════════════ */
describe('module safety', () => {
  it('does not throw when sticky bar element is absent', () => {
    document.body.innerHTML = '<p>no product here</p>';
    expect(() => loadModule()).not.toThrow();
  });

  it('does not throw when product form is absent', () => {
    document.body.innerHTML = '<div id="sticky-buy-bar"></div>';
    expect(() => loadModule()).not.toThrow();
  });
});

/* ════════════════════════════════════════════════════
   2.  Sticky buy bar – initial state
════════════════════════════════════════════════════ */
describe('sticky buy bar – initial state', () => {
  it('exists in the DOM', () => {
    expect(document.getElementById('sticky-buy-bar')).not.toBeNull();
  });

  it('starts without is-visible class on initial load', () => {
    /* Re-load the module with the form mocked as in-viewport so the bar
       is correctly hidden on page load. */
    document.body.innerHTML = buildProductHtml();
    const form = document.querySelector('.product-form');
    jest.spyOn(form, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 400, left: 0, right: 600, width: 600, height: 300
    });
    loadModule();

    const bar = document.getElementById('sticky-buy-bar');
    expect(bar.classList.contains('is-visible')).toBe(false);
    expect(bar.getAttribute('aria-hidden')).toBe('true');
  });
});

/* ════════════════════════════════════════════════════
   3.  Sticky buy bar – scroll behaviour
════════════════════════════════════════════════════ */
describe('sticky buy bar – scroll visibility', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows bar (is-visible) when form is scrolled out of viewport', () => {
    const form = document.querySelector('.product-form');
    jest.spyOn(form, 'getBoundingClientRect').mockReturnValue({
      top: -200, bottom: -100, left: 0, right: 600, width: 600, height: 100
    });
    window.dispatchEvent(new Event('scroll'));
    jest.runAllTimers();

    const bar = document.getElementById('sticky-buy-bar');
    expect(bar.classList.contains('is-visible')).toBe(true);
    expect(bar.getAttribute('aria-hidden')).toBe('false');
  });

  it('hides bar (no is-visible) when form scrolls back into viewport', () => {
    const form = document.querySelector('.product-form');
    const spy = jest.spyOn(form, 'getBoundingClientRect');

    /* Scroll out */
    spy.mockReturnValue({
      top: -200, bottom: -100, left: 0, right: 600, width: 600, height: 100
    });
    window.dispatchEvent(new Event('scroll'));
    jest.runAllTimers();

    /* Scroll back in */
    spy.mockReturnValue({
      top: 100, bottom: 400, left: 0, right: 600, width: 600, height: 300
    });
    window.dispatchEvent(new Event('scroll'));
    jest.runAllTimers();

    const bar = document.getElementById('sticky-buy-bar');
    expect(bar.classList.contains('is-visible')).toBe(false);
    expect(bar.getAttribute('aria-hidden')).toBe('true');
  });
});

/* ════════════════════════════════════════════════════
   4.  Sticky buy bar – button click
════════════════════════════════════════════════════ */
describe('sticky buy bar – button click', () => {
  it('triggers a click on the form submit button', () => {
    const submitBtn = document.querySelector('.product-form [type="submit"]');
    const clickSpy = jest.spyOn(submitBtn, 'click');

    document.getElementById('sticky-buy-bar-btn').click();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

/* ════════════════════════════════════════════════════
   5.  Urgency badge – variant select change
════════════════════════════════════════════════════ */
describe('urgency badge – variant select change', () => {
  function changeVariantTo(index) {
    const sel = document.getElementById('variant-select');
    sel.selectedIndex = index;
    sel.dispatchEvent(new Event('change'));
  }

  it('hides the badge when the new variant has high stock (qty > 5)', () => {
    changeVariantTo(1); // qty=10
    const badge = document.querySelector('.urgency-badge');
    expect(badge.hidden).toBe(true);
  });

  it('hides the badge when inventory is not tracked', () => {
    document.body.innerHTML = buildProductHtml({ qty: 2, managed: 'false', policy: 'deny' });
    loadModule();
    const sel = document.getElementById('variant-select');
    sel.dispatchEvent(new Event('change'));
    const badge = document.querySelector('.urgency-badge');
    expect(badge.hidden).toBe(true);
  });

  it('hides the badge when inventory_policy is continue', () => {
    document.body.innerHTML = buildProductHtml({ qty: 2, managed: 'true', policy: 'continue' });
    loadModule();
    const sel = document.getElementById('variant-select');
    sel.dispatchEvent(new Event('change'));
    const badge = document.querySelector('.urgency-badge');
    expect(badge.hidden).toBe(true);
  });

  it('updates badge text with correct quantity when switching to low-stock variant', () => {
    /* Override first option to qty=2 in DOM to simulate switching back */
    const sel = document.getElementById('variant-select');
    sel.options[0].setAttribute('data-inventory-qty', '2');
    changeVariantTo(0);

    const badge = document.querySelector('.urgency-badge');
    expect(badge.hidden).toBeFalsy();
    expect(badge.querySelector('.urgency-badge__text').textContent).toContain('2');
  });

  it('adds urgency-badge--critical class when qty <= 2', () => {
    const sel = document.getElementById('variant-select');
    sel.options[0].setAttribute('data-inventory-qty', '1');
    sel.selectedIndex = 0;
    sel.dispatchEvent(new Event('change'));

    const badge = document.querySelector('.urgency-badge');
    expect(badge.classList.contains('urgency-badge--critical')).toBe(true);
  });

  it('removes urgency-badge--critical class when qty is 3–5', () => {
    /* First make it critical */
    const sel = document.getElementById('variant-select');
    sel.options[0].setAttribute('data-inventory-qty', '1');
    sel.dispatchEvent(new Event('change'));

    /* Then switch to qty=4 */
    sel.options[0].setAttribute('data-inventory-qty', '4');
    sel.dispatchEvent(new Event('change'));

    const badge = document.querySelector('.urgency-badge');
    expect(badge.classList.contains('urgency-badge--critical')).toBe(false);
  });

  it('updates the progress bar fill width', () => {
    const sel = document.getElementById('variant-select');
    sel.options[0].setAttribute('data-inventory-qty', '4');
    sel.dispatchEvent(new Event('change'));

    const fill = document.querySelector('.urgency-badge__bar-fill');
    /* 4/5 = 80% */
    expect(fill.style.width).toBe('80%');
  });

  it('updates the aria-valuenow on the progress bar', () => {
    const sel = document.getElementById('variant-select');
    sel.options[0].setAttribute('data-inventory-qty', '4');
    sel.dispatchEvent(new Event('change'));

    const bar = document.querySelector('.urgency-badge__bar');
    expect(bar.getAttribute('aria-valuenow')).toBe('4');
  });
});

/* ════════════════════════════════════════════════════
   6.  Urgency badge – custom variant:change event
════════════════════════════════════════════════════ */
describe('urgency badge – variant:change custom event', () => {
  function dispatchVariantChange(variant) {
    document.dispatchEvent(
      new CustomEvent('variant:change', { detail: { variant } })
    );
  }

  it('updates badge when variant:change fires with low-stock tracked variant', () => {
    dispatchVariantChange({
      inventory_management: 'shopify',
      inventory_policy:     'deny',
      inventory_quantity:   2
    });

    const badge = document.querySelector('.urgency-badge');
    expect(badge.hidden).toBeFalsy();
    expect(badge.querySelector('.urgency-badge__text').textContent).toContain('2');
  });

  it('hides badge when variant:change fires with high-stock variant', () => {
    dispatchVariantChange({
      inventory_management: 'shopify',
      inventory_policy:     'deny',
      inventory_quantity:   20
    });

    const badge = document.querySelector('.urgency-badge');
    expect(badge.hidden).toBe(true);
  });

  it('does not throw when event detail has no variant', () => {
    expect(() =>
      document.dispatchEvent(new CustomEvent('variant:change', { detail: {} }))
    ).not.toThrow();
  });
});
