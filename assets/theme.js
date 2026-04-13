/**
 * Fixaotrixa – Global Theme JavaScript
 *
 * Covers:
 *  - Mobile menu toggle
 *  - Scroll-reveal animations (IntersectionObserver)
 *  - Count-up numbers
 *  - Word-reveal text animations
 *  - Announcement bar shimmer
 *  - Newsletter popup (settings-driven)
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     Mobile menu toggle
  ══════════════════════════════════════════════ */
  function initMobileMenu() {
    var toggleBtn  = document.querySelector('.menu-toggle');
    var mobileMenu = document.getElementById('mobile-menu');
    if (!toggleBtn || !mobileMenu) return;

    toggleBtn.addEventListener('click', function () {
      var isOpen = mobileMenu.getAttribute('aria-hidden') === 'false';
      mobileMenu.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      mobileMenu.classList.toggle('is-open', !isOpen);
    });

    /* Close on outside click */
    document.addEventListener('click', function (e) {
      if (!mobileMenu.contains(e.target) && !toggleBtn.contains(e.target)) {
        mobileMenu.setAttribute('aria-hidden', 'true');
        toggleBtn.setAttribute('aria-expanded', 'false');
        mobileMenu.classList.remove('is-open');
      }
    });
  }

  /* ══════════════════════════════════════════════
     Scroll-reveal (IntersectionObserver)
  ══════════════════════════════════════════════ */
  function initScrollAnimations() {
    if (!('IntersectionObserver' in window)) {
      /* Fallback: show all immediately */
      var elements = document.querySelectorAll('.sa');
      for (var i = 0; i < elements.length; i++) {
        elements[i].classList.add('visible');
      }
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    var targets = document.querySelectorAll('.sa');
    for (var j = 0; j < targets.length; j++) {
      observer.observe(targets[j]);
    }
  }

  /* ══════════════════════════════════════════════
     Count-up numbers
  ══════════════════════════════════════════════ */
  function initCountUp() {
    var counters = document.querySelectorAll('[data-count-to]');
    if (!counters.length) return;

    if (!('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el     = entry.target;
        var target = parseInt(el.getAttribute('data-count-to'), 10);
        var suffix = el.getAttribute('data-count-suffix') || '';
        var dur    = 1500;
        var start  = Date.now();

        observer.unobserve(el);

        (function tick() {
          var elapsed  = Date.now() - start;
          var progress = Math.min(elapsed / dur, 1);
          /* ease-out */
          var eased    = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * target) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }());
      });
    }, { threshold: 0.5 });

    for (var i = 0; i < counters.length; i++) {
      observer.observe(counters[i]);
    }
  }

  /* ══════════════════════════════════════════════
     Word-reveal animations
  ══════════════════════════════════════════════ */
  function initWordReveal() {
    var els = document.querySelectorAll('.word-reveal');
    if (!els.length) return;

    /* Wrap words – use textContent to prevent XSS, then build DOM nodes */
    for (var i = 0; i < els.length; i++) {
      var el    = els[i];
      var words = el.textContent.trim().split(/\s+/);
      el.textContent = '';
      words.forEach(function (w, idx) {
        var span = document.createElement('span');
        span.className   = 'word';
        span.textContent = w;
        span.style.transitionDelay = (idx * 0.08) + 's';
        el.appendChild(span);
        if (idx < words.length - 1) el.appendChild(document.createTextNode(' '));
      });
    }

    if (!('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    for (var j = 0; j < els.length; j++) {
      observer.observe(els[j]);
    }
  }

  /* ══════════════════════════════════════════════
     Newsletter popup (DOM-based, driven by settings)
  ══════════════════════════════════════════════ */
  function initNewsletterPopup() {
    var popup = document.querySelector('.newsletter-popup');
    if (!popup) return;

    /* Auto-show after 5 s if not dismissed */
    var key = 'fxa_newsletter_shown';
    if (sessionStorage.getItem(key)) return;

    setTimeout(function () {
      popup.classList.add('is-visible');
      sessionStorage.setItem(key, '1');
    }, 5000);

    var closeBtn = popup.querySelector('.close-popup');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        popup.classList.remove('is-visible');
      });
    }
  }

  /* ══════════════════════════════════════════════
     Boot
  ══════════════════════════════════════════════ */
  function boot() {
    initMobileMenu();
    initScrollAnimations();
    initCountUp();
    initWordReveal();
    initNewsletterPopup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
