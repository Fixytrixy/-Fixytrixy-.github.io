/**
 * product-ui.js  –  Fixaotrixa Product Page UI Enhancements
 *
 * Features:
 *  1. Sticky "Köp nu" bar – shows on mobile when the product form
 *     scrolls out of the viewport. Clicking the sticky button submits
 *     the main product form.
 *
 *  2. Urgency live update – updates the urgency badge text when the
 *     customer changes the selected variant (listens to the native
 *     <select> change event and a custom 'variant:change' event that
 *     many Shopify themes dispatch).
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     1.  Sticky Buy Bar
  ══════════════════════════════════════════════════════════ */

  /**
   * Returns true when the given element is at least partially visible
   * in the current viewport.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function isInViewport(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.top    < (window.innerHeight || document.documentElement.clientHeight)
    );
  }

  function initStickyBuyBar() {
    var bar         = document.getElementById('sticky-buy-bar');
    var stickyBtn   = document.getElementById('sticky-buy-bar-btn');
    var productForm = document.querySelector('.product-form');

    if (!bar || !productForm) return;

    /* Show/hide the bar based on product form visibility */
    function updateBarVisibility() {
      var formVisible = isInViewport(productForm);
      if (formVisible) {
        bar.classList.remove('is-visible');
        bar.setAttribute('aria-hidden', 'true');
      } else {
        bar.classList.add('is-visible');
        bar.setAttribute('aria-hidden', 'false');
      }
    }

    /* Throttle scroll handler to ~60 fps */
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateBarVisibility();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    /* Run once on load */
    updateBarVisibility();

    /* Sticky button click → submit the main product form */
    if (stickyBtn) {
      stickyBtn.addEventListener('click', function () {
        var submitBtn = productForm.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.click();
        } else {
          productForm.submit();
        }
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     2.  Urgency Badge – live update on variant change
  ══════════════════════════════════════════════════════════ */

  /**
   * Updates the urgency badge when the selected variant changes.
   *
   * @param {number} qty            Current inventory quantity for the variant.
   * @param {number} [threshold=5]  Maximum qty at which the badge is shown.
   */
  function updateUrgencyBadge(qty, threshold) {
    threshold = threshold || 5;
    var badge    = document.querySelector('.urgency-badge');
    var textEl   = badge && badge.querySelector('.urgency-badge__text');
    var barFill  = badge && badge.querySelector('.urgency-badge__bar-fill');
    var barEl    = badge && badge.querySelector('.urgency-badge__bar');

    if (!badge) return;

    if (qty <= 0 || qty > threshold) {
      /* No longer low-stock – hide the badge */
      badge.hidden = true;
      return;
    }

    badge.hidden = false;

    /* Update critical styling */
    if (qty <= 2) {
      badge.classList.add('urgency-badge--critical');
    } else {
      badge.classList.remove('urgency-badge--critical');
    }

    /* Update text */
    if (textEl) {
      var strong = document.createElement('strong');
      strong.textContent = String(qty);
      textEl.textContent = 'Bara ';
      textEl.appendChild(strong);
      textEl.appendChild(document.createTextNode(' kvar i lager!'));
    }

    /* Update progress bar */
    if (barFill) {
      barFill.style.width = Math.round((qty / threshold) * 100) + '%';
    }

    /* Update ARIA attributes */
    if (barEl) {
      barEl.setAttribute('aria-valuenow', qty);
    }

    badge.setAttribute('data-inventory', qty);
  }

  function initUrgencyBadge() {
    var variantSelect = document.getElementById('variant-select');
    if (!variantSelect) return;

    variantSelect.addEventListener('change', function () {
      /* Read data-inventory-* attributes set by the theme on the <option> */
      var selectedOption = variantSelect.options[variantSelect.selectedIndex];
      var qty     = parseInt(selectedOption.getAttribute('data-inventory-qty'), 10);
      var managed = selectedOption.getAttribute('data-inventory-managed') === 'true';
      var policy  = selectedOption.getAttribute('data-inventory-policy');

      if (!isNaN(qty) && managed && policy === 'deny') {
        updateUrgencyBadge(qty);
      } else {
        /* No inventory tracking – hide badge */
        var badge = document.querySelector('.urgency-badge');
        if (badge) badge.hidden = true;
      }
    });

    /* Also listen for the custom variant:change event used by many themes */
    document.addEventListener('variant:change', function (e) {
      var variant = e.detail && e.detail.variant;
      if (!variant) return;
      if (
        variant.inventory_management === 'shopify' &&
        variant.inventory_policy     === 'deny'
      ) {
        updateUrgencyBadge(variant.inventory_quantity);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     Boot
  ══════════════════════════════════════════════════════════ */
  function boot() {
    initStickyBuyBar();
    initUrgencyBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
