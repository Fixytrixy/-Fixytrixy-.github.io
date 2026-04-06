/**
 * Fixaotrixa Quiz – JavaScript
 * Interaktivt quiz: "Vilket rum ska vi fixa?"
 */

(function () {
  'use strict';

  /* ── Category URL map ── */
  var CATEGORY_URLS = {
    kok:      '/collections/koksforvaring',
    sovrum:   '/collections/sovrumsforvaring',
    badrum:   '/collections/badrumsforvaring',
    tradgard: '/collections/tradgardsforvaring',
    hall:     '/collections/hallforvaring',
    kontor:   '/collections/kontorsforvaring'
  };

  /* ── Category names (Swedish) ── */
  var CATEGORY_NAMES = {
    kok:      'Köksförvaring',
    sovrum:   'Sovrumsförvaring',
    badrum:   'Badrumsförvaring',
    tradgard: 'Trädgårdsförvaring',
    hall:     'Hallförvaring',
    kontor:   'Kontorsförvaring'
  };

  var answers = {};
  var currentStep = 1;
  var TOTAL_STEPS = 3;

  function init() {
    var container = document.getElementById('quiz-container');
    if (!container) return;

    /* Option click */
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.quiz__option');
      if (btn) handleOption(btn);

      var backBtn = e.target.closest('.quiz__back');
      if (backBtn) handleBack(parseInt(backBtn.dataset.back, 10));

      var restartBtn = e.target.closest('#quiz-restart');
      if (restartBtn) resetQuiz();
    });
  }

  function handleOption(btn) {
    var nextId = btn.dataset.next;
    var value  = btn.dataset.value;

    /* Save answer for current step */
    if (currentStep === 1) answers.room     = value;
    if (currentStep === 2) answers.problem  = value;
    if (currentStep === 3) answers.budget   = value;

    /* Visual feedback */
    btn.closest('.quiz__options, .quiz__options--grid, .quiz__options--list')
      .querySelectorAll('.quiz__option').forEach(function (b) {
        b.classList.remove('quiz__option--selected');
      });
    btn.classList.add('quiz__option--selected');

    setTimeout(function () {
      if (nextId === 'result') {
        showResult();
      } else {
        goToStep(parseInt(nextId, 10));
      }
    }, 350);
  }

  function goToStep(step) {
    hideAllSteps();
    var stepEl = document.getElementById('quiz-step-' + step);
    if (stepEl) {
      stepEl.classList.add('quiz__step--active');
      currentStep = step;
      updateProgress(step);
      /* Announce step for screen readers */
      var titleEl = stepEl.querySelector('[id$="-title"]');
      if (titleEl) titleEl.focus();
    }
  }

  function handleBack(step) {
    goToStep(step);
  }

  function showResult() {
    hideAllSteps();
    var resultEl = document.getElementById('quiz-step-result');
    if (resultEl) {
      resultEl.classList.add('quiz__step--active');
    }

    /* Build result CTA URL */
    var baseUrl = CATEGORY_URLS[answers.room] || '/collections/all';
    var params = [];
    if (answers.budget === 'low')  params.push('sort_by=price-ascending');
    if (answers.budget === 'high') params.push('sort_by=price-descending');
    var url = baseUrl + (params.length ? '?' + params.join('&') : '');

    var ctaEl   = document.getElementById('quiz-result-cta');
    var textEl  = document.getElementById('quiz-result-text');
    var catName = CATEGORY_NAMES[answers.room] || 'alla produkter';

    if (ctaEl)  ctaEl.href = url;
    if (textEl) textEl.textContent =
      'Vi rekommenderar ' + catName + ' baserat på dina svar!';
    if (ctaEl)  ctaEl.textContent = 'Visa ' + catName + ' →';

    /* Update progress to complete */
    var progressFill = document.getElementById('quiz-progress-fill');
    var progressText = document.getElementById('quiz-progress-text');
    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = 'Klart!';

    /* Track in GA4 */
    if (typeof gtag === 'function') {
      gtag('event', 'quiz_complete', {
        quiz_room:    answers.room    || '',
        quiz_problem: answers.problem || '',
        quiz_budget:  answers.budget  || ''
      });
    }
  }

  function resetQuiz() {
    answers      = {};
    currentStep  = 1;
    /* Clear option selections */
    document.querySelectorAll('.quiz__option--selected').forEach(function (b) {
      b.classList.remove('quiz__option--selected');
    });
    goToStep(1);
  }

  function hideAllSteps() {
    document.querySelectorAll('.quiz__step').forEach(function (s) {
      s.classList.remove('quiz__step--active');
    });
  }

  function updateProgress(step) {
    var percent     = Math.round((step / TOTAL_STEPS) * 100);
    var progressFill = document.getElementById('quiz-progress-fill');
    var progressText = document.getElementById('quiz-progress-text');
    var progressBar  = document.querySelector('.quiz__progress');

    if (progressFill) progressFill.style.width = percent + '%';
    if (progressText) progressText.textContent = 'Steg ' + step + ' av ' + TOTAL_STEPS;
    if (progressBar) {
      progressBar.setAttribute('aria-valuenow', step);
    }
  }

  /* Init on DOMContentLoaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
