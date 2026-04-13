/**
 * Fixaotrixa – Home & Product Page JavaScript
 *
 * Covers:
 *  1. Cart count badge update on load
 *  2. AJAX add-to-cart form
 *  3. Exit-intent popup (email capture)
 *  4. Smooth scroll for anchor links
 *  5. Variant selector → update hidden id + price + button state
 *  6. IntersectionObserver lazy-loading for images
 *  7. GA4 / gtag events
 *  8. Klaviyo (_learnq) email tracking
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     1. Cart count badge
  ══════════════════════════════════════════════ */
  function updateCartCount() {
    fetch('/cart.js')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var count   = data.item_count || 0;
        var badges  = document.querySelectorAll('[data-cart-count]');
        for (var i = 0; i < badges.length; i++) {
          badges[i].textContent = count;
          if (badges[i].hasAttribute('aria-label')) {
            badges[i].setAttribute('aria-label', count + ' produkter i kundvagnen');
          }
        }
      })
      .catch(function () { /* silently ignore network errors */ });
  }

  /* ══════════════════════════════════════════════
     2. AJAX add-to-cart form
  ══════════════════════════════════════════════ */
  function initAddToCart() {
    var forms = document.querySelectorAll('[data-type="add-to-cart-form"]');
    for (var i = 0; i < forms.length; i++) {
      forms[i].addEventListener('submit', handleCartSubmit);
    }
  }

  function handleCartSubmit(e) {
    e.preventDefault();

    var form = e.currentTarget;
    var btn  = form.querySelector('[name="add"]');
    if (!btn || btn.disabled) return; /* already pending */

    var originalHtml = btn.innerHTML;

    /* Loading state */
    btn.disabled  = true;
    btn.innerHTML = '<span>Lägger till…</span>';

    /* Build form data */
    var formData = new FormData(form);
    var body     = {};
    formData.forEach(function (val, key) { body[key] = val; });

    var addUrl = (window.routes && window.routes.cart_add_url)
      ? window.routes.cart_add_url
      : '/cart/add.js';

    fetch(addUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) { throw new Error('cart-add failed'); }
        return res.json();
      })
      .then(function (item) {
        /* Success state */
        btn.innerHTML        = '<span>✓ Tillagd</span>';
        btn.style.background = 'rgb(56, 142, 60)';

        updateCartCount();

        /* GA4 */
        if (typeof gtag === 'function') {
          gtag('event', 'add_to_cart', {
            currency: item.currency || 'SEK',
            value:    (item.price || 0) / 100,
            items: [{
              item_id:   String(item.id),
              item_name: item.title || '',
              vendor:    item.vendor || '',
              quantity:  item.quantity || 1,
              price:     (item.price || 0) / 100
            }]
          });
        }

        /* Restore after 2 s */
        setTimeout(function () {
          btn.disabled         = false;
          btn.innerHTML        = originalHtml;
          btn.style.background = '';
        }, 2000);
      })
      .catch(function (err) {
        console.error('add-to-cart error:', err);
        btn.disabled  = false;
        btn.innerHTML = originalHtml;
      });
  }

  /* ══════════════════════════════════════════════
     3. Exit-intent popup
  ══════════════════════════════════════════════ */
  function initExitIntent() {
    var popup = document.getElementById('exit-intent-popup');
    if (!popup) return;

    /* Skip if already shown in this session */
    if (sessionStorage.getItem('fxa_exit_shown')) return;

    var hasShown = false;

    function showPopup() {
      if (hasShown) return;
      hasShown = true;
      sessionStorage.setItem('fxa_exit_shown', '1');
      popup.style.display = 'flex';
      popup.removeAttribute('aria-hidden');
    }

    function closePopup() {
      popup.style.display = 'none';
      popup.setAttribute('aria-hidden', 'true');
    }

    /* Trigger on mouse exit from viewport (top of page) */
    document.addEventListener('mouseleave', function (e) {
      if (e.clientY <= 0) showPopup();
    });

    /* Close via button */
    var closeBtn = popup.querySelector('.exit-popup__close');
    if (closeBtn) closeBtn.addEventListener('click', closePopup);

    /* Close via overlay */
    var overlay = popup.querySelector('.exit-popup__overlay');
    if (overlay) overlay.addEventListener('click', closePopup);

    /* Close via Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePopup();
    });

    /* Email form inside popup */
    var emailForm = document.getElementById('exit-popup-form');
    if (emailForm) {
      emailForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var emailInput = emailForm.querySelector('input[type="email"]');
        var email      = emailInput ? emailInput.value.trim() : '';

        if (!email) return;

        closePopup();

        /* Klaviyo */
        if (window._learnq && typeof window._learnq.push === 'function') {
          window._learnq.push(['identify', { '$email': email }]);
        }

        /* GA4 */
        if (typeof gtag === 'function') {
          gtag('event', 'generate_lead', { value: 1, currency: 'SEK' });
        }
      });
    }
  }

  /* ══════════════════════════════════════════════
     4. Smooth scroll for anchor links
  ══════════════════════════════════════════════ */
  function initSmoothScroll() {
    var anchors = document.querySelectorAll('a[href^="#"]');
    for (var i = 0; i < anchors.length; i++) {
      anchors[i].addEventListener('click', function (e) {
        var hash   = this.getAttribute('href');
        var target = hash ? document.querySelector(hash) : null;
        if (!target) return; /* let browser handle dangling anchors */
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  /* ══════════════════════════════════════════════
     5. Variant selection
  ══════════════════════════════════════════════ */
  function formatPrice(priceInOre) {
    return (priceInOre / 100).toLocaleString('sv-SE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' kr';
  }

  function initVariantSelector() {
    var form = document.querySelector('[data-type="add-to-cart-form"]');
    if (!form) return;

    var selects = form.querySelectorAll('.product-form__option-select');
    for (var i = 0; i < selects.length; i++) {
      selects[i].addEventListener('change', updateVariantId);
    }
  }

  function updateVariantId() {
    var form    = document.querySelector('[data-type="add-to-cart-form"]');
    if (!form) return;

    var variants = window.productVariants;
    if (!variants || !variants.length) return;

    /* Collect currently selected option values */
    var selects       = form.querySelectorAll('.product-form__option-select');
    var selectedOpts  = [];
    for (var i = 0; i < selects.length; i++) {
      selectedOpts.push(selects[i].value);
    }

    /* Find matching variant */
    var matched = null;
    for (var j = 0; j < variants.length; j++) {
      var v       = variants[j];
      var options = v.options || [];
      var match   = true;
      for (var k = 0; k < selectedOpts.length; k++) {
        if (options[k] !== selectedOpts[k]) { match = false; break; }
      }
      if (match) { matched = v; break; }
    }

    if (!matched) return;

    /* Update hidden id */
    var idInput = form.querySelector('[name="id"]');
    if (idInput) idInput.value = String(matched.id);

    /* Update price display */
    var priceEl = document.querySelector('.product-page__price-current');
    if (priceEl && matched.price != null) {
      priceEl.textContent = formatPrice(matched.price);
    }

    /* Update button state */
    var btn     = form.querySelector('[name="add"]');
    var btnSpan = btn ? btn.querySelector('span') : null;

    if (btn) {
      if (matched.available) {
        btn.disabled = false;
        if (btnSpan) btnSpan.textContent = 'Lägg i varukorg';
      } else {
        btn.disabled = true;
        if (btnSpan) btnSpan.textContent = 'Slutsåld';
      }
    }
  }

  /* ══════════════════════════════════════════════
     6. IntersectionObserver lazy-loading
  ══════════════════════════════════════════════ */
  function initLazyImages() {
    if (!('IntersectionObserver' in window)) return; /* skip in environments without IO */

    var lazyImages = document.querySelectorAll('img[loading="lazy"]');
    if (!lazyImages.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        loadImage(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '200px' });

    for (var i = 0; i < lazyImages.length; i++) {
      observer.observe(lazyImages[i]);
    }
  }

  function loadImage(img) {
    var src = img.getAttribute('data-src');
    if (!src) return;
    img.src = src;
    img.removeAttribute('data-src');
  }

  /* ══════════════════════════════════════════════
     7. GA4 view_item (product pages)
  ══════════════════════════════════════════════ */
  function fireViewItem() {
    if (document.body.dataset.template !== 'product') return;
    if (typeof gtag !== 'function') return;

    var title    = '';
    var titleEl  = document.querySelector('.product-page__title');
    if (titleEl) title = titleEl.textContent.trim();

    var price    = 0;
    var priceEl  = document.querySelector('.product-page__price-current');
    if (priceEl) {
      var raw = priceEl.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
      price   = parseFloat(raw) || 0;
    }

    gtag('event', 'view_item', {
      currency: 'SEK',
      value:    price,
      items: [{
        item_name: title,
        price:     price
      }]
    });
  }

  /* ══════════════════════════════════════════════
     Boot
  ══════════════════════════════════════════════ */
  function boot() {
    updateCartCount();
    initAddToCart();
    initExitIntent();
    initSmoothScroll();
    initVariantSelector();
    initLazyImages();
    fireViewItem();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
