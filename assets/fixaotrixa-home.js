/**
 * Fixaotrixa – Huvud-JavaScript
 * Hanterar kundvagn, bilder, exit-intent och Google Analytics-events
 */

(function () {
  'use strict';

  /* ─── Add to Cart (AJAX) ─── */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches('[data-type="add-to-cart-form"]')) return;
    e.preventDefault();

    var btn = form.querySelector('[name="add"]');
    if (!btn || btn.disabled) return;

    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>Lägger till...</span>';

    var formData = new FormData(form);
    var data = {};
    formData.forEach(function (val, key) { data[key] = val; });

    fetch(window.routes ? window.routes.cart_add_url : '/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ id: data.id, quantity: parseInt(data.quantity || 1, 10) })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Något gick fel');
        return res.json();
      })
      .then(function (item) {
        btn.innerHTML = '✓ Tillagd!';
        btn.style.background = '#388e3c';
        updateCartCount();
        trackAddToCart(item);
        setTimeout(function () {
          btn.innerHTML = originalText;
          btn.style.background = '';
          btn.disabled = false;
        }, 2000);
      })
      .catch(function (err) {
        console.error('Cart error:', err);
        btn.innerHTML = originalText;
        btn.disabled = false;
      });
  });

  /* ─── Update cart count in header ─── */
  function updateCartCount() {
    fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
          el.textContent = cart.item_count;
          el.setAttribute('aria-label', cart.item_count + ' produkter i kundvagnen');
        });
      })
      .catch(function () {});
  }

  /* ─── GA4 event: add_to_cart ─── */
  function trackAddToCart(item) {
    if (typeof gtag !== 'function') return;
    gtag('event', 'add_to_cart', {
      currency: item.currency || 'SEK',
      value: (item.price / 100),
      items: [{
        item_id: String(item.id),
        item_name: item.title,
        item_brand: item.vendor || '',
        price: (item.price / 100),
        quantity: item.quantity
      }]
    });
  }

  /* ─── Exit Intent Popup ─── */
  var popup = document.getElementById('exit-intent-popup');
  if (popup) {
    var hasShown = false;
    var SESSION_KEY = 'fxa_exit_shown';

    if (!sessionStorage.getItem(SESSION_KEY)) {
      document.addEventListener('mouseleave', function (e) {
        if (e.clientY <= 0 && !hasShown) {
          showPopup();
        }
      });
    }

    function showPopup() {
      hasShown = true;
      sessionStorage.setItem(SESSION_KEY, '1');
      popup.style.display = 'flex';
      popup.removeAttribute('aria-hidden');
      var firstInput = popup.querySelector('input');
      if (firstInput) firstInput.focus();
    }

    function closePopup() {
      popup.style.display = 'none';
      popup.setAttribute('aria-hidden', 'true');
    }

    var closeBtn = popup.querySelector('.exit-popup__close');
    if (closeBtn) closeBtn.addEventListener('click', closePopup);

    var overlay = popup.querySelector('.exit-popup__overlay');
    if (overlay) overlay.addEventListener('click', closePopup);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popup.style.display !== 'none') closePopup();
    });

    var form = document.getElementById('exit-popup-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = form.querySelector('input[type="email"]').value;
        subscribeEmail(email);
        closePopup();
      });
    }
  }

  /* ─── Email subscription (Klaviyo) ─── */
  function subscribeEmail(email) {
    if (!email) return;
    if (typeof window._learnq !== 'undefined') {
      window._learnq.push(['identify', { '$email': email }]);
    }
    if (typeof gtag === 'function') {
      gtag('event', 'generate_lead', { value: 1, currency: 'SEK' });
    }
  }

  /* ─── Lazy-load images with IntersectionObserver ─── */
  if ('IntersectionObserver' in window) {
    var lazyImages = document.querySelectorAll('img[loading="lazy"]');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });
    lazyImages.forEach(function (img) { observer.observe(img); });
  }

  /* ─── Smooth scroll for anchor links ─── */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ─── Product page: variant selection ─── */
  var variantSelects = document.querySelectorAll('.product-form__option-select');
  if (variantSelects.length) {
    variantSelects.forEach(function (sel) {
      sel.addEventListener('change', updateVariantId);
    });
  }

  function updateVariantId() {
    var form = document.querySelector('[data-type="add-to-cart-form"]');
    if (!form) return;
    var options = {};
    form.querySelectorAll('.product-form__option-select').forEach(function (sel) {
      options[sel.name] = sel.value;
    });
    if (typeof window.productVariants !== 'undefined') {
      var matched = window.productVariants.find(function (v) {
        return v.options.every(function (opt, i) {
          return options[Object.keys(options)[i]] === opt;
        });
      });
      if (matched) {
        var idInput = form.querySelector('[name="id"]');
        if (idInput) idInput.value = matched.id;
        var priceEl = document.querySelector('.product-page__price-current');
        if (priceEl) priceEl.textContent = formatMoney(matched.price);
        var addBtn = form.querySelector('[name="add"]');
        if (addBtn) {
          addBtn.disabled = !matched.available;
          var addBtnSpan = addBtn.querySelector('span');
          if (addBtnSpan) addBtnSpan.textContent = matched.available ? 'Lägg i varukorg' : 'Slutsåld';
        }
      }
    }
  }

  function formatMoney(cents) {
    return (cents / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' });
  }

  /* ─── Track page view (e-commerce) in GA4 ─── */
  if (typeof gtag === 'function' && document.body.dataset.template === 'product') {
    var priceEl = document.querySelector('.product-page__price-current');
    var titleEl = document.querySelector('.product-page__title');
    if (priceEl && titleEl) {
      gtag('event', 'view_item', {
        items: [{ item_name: titleEl.textContent.trim(), price: parseFloat(priceEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')) }]
      });
    }
  }

  /* ─── Room Filter (collection page) ─── */
  (function () {
    var filterBar = document.getElementById('room-filter');
    if (!filterBar) return;

    var grid = document.getElementById('product-grid');
    var noResults = document.getElementById('room-filter-no-results');
    var buttons = filterBar.querySelectorAll('.room-filter__btn');

    // Read initial filter from URL param ?tag=room-kitchen
    var params = new URLSearchParams(window.location.search);
    var activeRoom = params.get('tag') || '';

    function applyFilter(room) {
      activeRoom = room;

      // Update button states
      buttons.forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.dataset.room === room ? 'true' : 'false');
      });

      // Show/hide products
      var visibleCount = 0;
      if (grid) {
        grid.querySelectorAll('.product-grid__item').forEach(function (item) {
          var tags = item.dataset.tags || '';
          var visible = !room || (tags !== '' && tags.split(',').some(function (t) { return t.trim() === room; }));
          item.classList.toggle('product-grid__item--hidden', !visible);
          if (visible) visibleCount++;
        });
      }

      // No-results message
      if (noResults) {
        noResults.classList.toggle('collection-page__no-results--visible', visibleCount === 0 && room !== '');
      }

      // Update URL param without reload
      var newParams = new URLSearchParams(window.location.search);
      if (room) {
        newParams.set('tag', room);
      } else {
        newParams.delete('tag');
      }
      var newUrl = window.location.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
      history.replaceState(null, '', newUrl);
    }

    // Apply initial filter from URL
    applyFilter(activeRoom);

    // Click handlers
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyFilter(btn.dataset.room);
      });
    });
  }());

  /* ─── Init ─── */
  updateCartCount();

})();
