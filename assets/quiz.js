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
    vardagsrum: '/collections/vardagsrumsforvaring',
    tradgard: '/collections/tradgardsforvaring',
    hall:     '/collections/hallforvaring',
    kontor:   '/collections/kontorsforvaring'
  };

  /* ── Category display names ── */
  var CATEGORY_NAMES = {
    kok:        'Köksförvaring',
    sovrum:     'Sovrumsförvaring',
    badrum:     'Badrumsförvaring',
    vardagsrum: 'Vardagsrumsförvaring',
    tradgard:   'Trädgårdsförvaring',
    hall:       'Hallförvaring',
    kontor:     'Kontorsförvaring'
  };

  /* ── State ── */
  var answers = {};

  /* ── DOM helpers ── */
  function getStep(id) {
    return document.getElementById('quiz-step-' + id);
  }

  /* ── Progress update ── */
  function updateProgress(stepId) {
    var progressContainer = document.querySelector('.quiz__progress');
    var progressFill      = document.getElementById('quiz-progress-fill');
    var progressText      = document.getElementById('quiz-progress-text');

    if (!progressContainer || !progressFill || !progressText) return;

    if (stepId === 'result') {
      progressFill.style.width = '100%';
      progressText.textContent = 'Klart!';
      progressContainer.setAttribute('aria-valuenow', '3');
      return;
    }

    var step    = parseInt(stepId, 10);
    var total   = 3;
    var percent = Math.round((step / total) * 100);

    progressFill.style.width = percent + '%';
    progressText.textContent = 'Steg ' + step + ' av ' + total;
    progressContainer.setAttribute('aria-valuenow', String(step));
  }

  /* ── Navigate to a step ── */
  function goToStep(targetId) {
    var allSteps = document.querySelectorAll('.quiz__step');
    for (var i = 0; i < allSteps.length; i++) {
      allSteps[i].classList.remove('quiz__step--active');
    }

    var target = getStep(targetId);
    if (!target) return;

    target.classList.add('quiz__step--active');

    /* Focus heading for accessibility */
    var heading = target.querySelector('h2');
    if (heading) {
      setTimeout(function () { heading.focus(); }, 50);
    }

    updateProgress(targetId);
  }

  /* ── Build result CTA URL ── */
  function buildCTAUrl(room, budget) {
    var base = CATEGORY_URLS[room] || '/collections/all';
    if (budget === 'low')  return base + '?sort_by=price-ascending';
    if (budget === 'high') return base + '?sort_by=price-descending';
    return base;
  }

  /* ── Show result ── */
  function showResult() {
    var room   = answers.room   || '';
    var budget = answers.budget || 'medium';

    var categoryName = CATEGORY_NAMES[room] || 'Förvaring';
    var ctaUrl       = buildCTAUrl(room, budget);

    var resultText = document.getElementById('quiz-result-text');
    var resultCta  = document.getElementById('quiz-result-cta');

    if (resultText) {
      resultText.textContent = 'Vi rekommenderar: ' + categoryName;
    }

    if (resultCta) {
      resultCta.href        = ctaUrl;
      resultCta.textContent = 'Visa ' + categoryName;
    }

    goToStep('result');

    /* Analytics */
    if (typeof gtag === 'function') {
      gtag('event', 'quiz_complete', {
        quiz_room:   room,
        quiz_budget: budget
      });
    }
  }

  /* ── Handle option click ── */
  function handleOption(btn) {
    var value    = btn.getAttribute('data-value');
    var nextStep = btn.getAttribute('data-next');

    /* Visual feedback – mark selected, clear siblings */
    var siblings = btn.closest('.quiz__options, .quiz__options--list');
    if (siblings) {
      var opts = siblings.querySelectorAll('.quiz__option');
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.remove('quiz__option--selected');
      }
    }
    btn.classList.add('quiz__option--selected');

    /* Record answer by current step */
    var currentStep = btn.closest('.quiz__step');
    if (currentStep) {
      var stepId = currentStep.id.replace('quiz-step-', '');
      if (stepId === '1') answers.room    = value;
      if (stepId === '2') answers.problem = value;
      if (stepId === '3') answers.budget  = value;
    }

    /* Navigate */
    setTimeout(function () {
      if (nextStep === 'result') {
        showResult();
      } else if (nextStep) {
        goToStep(nextStep);
      }
    }, 150);
  }

  /* ── Handle back button ── */
  function handleBack(btn) {
    var targetStep = btn.getAttribute('data-back');
    if (targetStep) goToStep(targetStep);
  }

  /* ── Reset quiz ── */
  function resetQuiz() {
    answers = {};

    /* Clear selected states */
    var selected = document.querySelectorAll('.quiz__option--selected');
    for (var i = 0; i < selected.length; i++) {
      selected[i].classList.remove('quiz__option--selected');
    }

    goToStep(1);
  }

  /* ── Initialise ── */
  function init() {
    var container = document.getElementById('quiz-container');
    if (!container) return;

    /* Delegate option clicks */
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.quiz__option');
      if (btn) { handleOption(btn); return; }

      var backBtn = e.target.closest('.quiz__back');
      if (backBtn) { handleBack(backBtn); return; }

      var restartBtn = e.target.closest('#quiz-restart');
      if (restartBtn) { resetQuiz(); return; }
    });

    /* Set initial progress */
    updateProgress(1);
  }

  /* ── Bootstrap ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
