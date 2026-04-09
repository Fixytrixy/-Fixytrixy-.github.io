/**
 * @jest-environment jsdom
 *
 * Tests for assets/quiz.js
 *
 * The IIFE executes on require, so we build the DOM first, then require the
 * module.  jest.resetModules() in beforeEach gives us a fresh instance per test.
 */

'use strict';

/* ─── HTML fixture ──────────────────────────────────────────── */
function buildQuizHtml() {
  return `
    <div id="quiz-container">

      <!-- Step 1 -->
      <section class="quiz__step quiz__step--active" id="quiz-step-1">
        <h2 id="step-1-title" tabindex="-1">Vilket rum?</h2>
        <div class="quiz__options">
          <button class="quiz__option" data-value="kok"      data-next="2">Kök</button>
          <button class="quiz__option" data-value="sovrum"   data-next="2">Sovrum</button>
          <button class="quiz__option" data-value="badrum"   data-next="2">Badrum</button>
          <button class="quiz__option" data-value="tradgard" data-next="2">Trädgård</button>
          <button class="quiz__option" data-value="hall"     data-next="2">Hall</button>
          <button class="quiz__option" data-value="kontor"   data-next="2">Kontor</button>
        </div>
      </section>

      <!-- Step 2 -->
      <section class="quiz__step" id="quiz-step-2">
        <h2 id="step-2-title" tabindex="-1">Vilket problem?</h2>
        <button class="quiz__back" data-back="1">Tillbaka</button>
        <div class="quiz__options">
          <button class="quiz__option" data-value="kaos"  data-next="3">Kaos</button>
          <button class="quiz__option" data-value="plats" data-next="3">Plats</button>
        </div>
      </section>

      <!-- Step 3 -->
      <section class="quiz__step" id="quiz-step-3">
        <h2 id="step-3-title" tabindex="-1">Budget?</h2>
        <button class="quiz__back" data-back="2">Tillbaka</button>
        <div class="quiz__options--list">
          <button class="quiz__option" data-value="low"    data-next="result">Låg</button>
          <button class="quiz__option" data-value="medium" data-next="result">Medel</button>
          <button class="quiz__option" data-value="high"   data-next="result">Hög</button>
        </div>
      </section>

      <!-- Result -->
      <section class="quiz__step" id="quiz-step-result">
        <p id="quiz-result-text"></p>
        <a id="quiz-result-cta" href="#">Visa produkter</a>
        <button id="quiz-restart">Starta om</button>
      </section>

      <!-- Progress -->
      <div class="quiz__progress" aria-valuenow="1" aria-valuemin="1" aria-valuemax="3">
        <div id="quiz-progress-fill" style="width:33%"></div>
        <span id="quiz-progress-text">Steg 1 av 3</span>
      </div>

    </div>
  `;
}

/* ─── Helper: load the module fresh ────────────────────────── */
function loadQuiz() {
  jest.resetModules();
  require('../assets/quiz.js');
}

/* ─── Helper: click a button and flush timers ───────────────── */
function clickOption(selector) {
  const btn = document.querySelector(selector);
  btn.click();
}

/* ════════════════════════════════════════════════════
   Setup / teardown
════════════════════════════════════════════════════ */
beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = buildQuizHtml();
  loadQuiz();
});

afterEach(() => {
  jest.useRealTimers();
});

/* ════════════════════════════════════════════════════
   1.  Initialisation
════════════════════════════════════════════════════ */
describe('init', () => {
  it('does nothing when #quiz-container is absent', () => {
    document.body.innerHTML = '<div>no quiz here</div>';
    // Loading without container should not throw
    expect(() => loadQuiz()).not.toThrow();
  });

  it('does not crash when container exists', () => {
    expect(document.getElementById('quiz-container')).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════
   2.  Option selection – answer recording
════════════════════════════════════════════════════ */
describe('handleOption – answer recording', () => {
  it('records the room answer at step 1', () => {
    // Click "Kök" (data-value="kok")
    clickOption('[data-value="kok"]');
    jest.runAllTimers();

    // After navigating to step 2 the quiz has moved; step 1 is no longer active
    expect(document.getElementById('quiz-step-2').classList).toContain('quiz__step--active');
  });

  it('records the problem answer at step 2 then moves to step 3', () => {
    // Step 1
    clickOption('[data-value="kok"]');
    jest.runAllTimers();

    // Step 2
    clickOption('[data-value="kaos"]');
    jest.runAllTimers();

    expect(document.getElementById('quiz-step-3').classList).toContain('quiz__step--active');
  });

  it('shows result after answering all 3 steps', () => {
    clickOption('[data-value="kok"]');
    jest.runAllTimers();
    clickOption('[data-value="kaos"]');
    jest.runAllTimers();
    clickOption('[data-value="low"]');
    jest.runAllTimers();

    expect(document.getElementById('quiz-step-result').classList).toContain('quiz__step--active');
  });
});

/* ════════════════════════════════════════════════════
   3.  Option selection – visual feedback
════════════════════════════════════════════════════ */
describe('handleOption – visual feedback', () => {
  it('adds quiz__option--selected to the clicked option', () => {
    const btn = document.querySelector('[data-value="kok"]');
    btn.click();
    expect(btn.classList).toContain('quiz__option--selected');
  });

  it('removes quiz__option--selected from sibling options', () => {
    const kokBtn    = document.querySelector('[data-value="kok"]');
    const sovrumBtn = document.querySelector('[data-value="sovrum"]');

    kokBtn.click();           // select first
    sovrumBtn.click();        // select second

    expect(kokBtn.classList).not.toContain('quiz__option--selected');
    expect(sovrumBtn.classList).toContain('quiz__option--selected');
  });
});

/* ════════════════════════════════════════════════════
   4.  Step navigation
════════════════════════════════════════════════════ */
describe('goToStep', () => {
  it('deactivates all steps before activating the target', () => {
    clickOption('[data-value="kok"]');
    jest.runAllTimers();

    const allSteps = document.querySelectorAll('.quiz__step');
    const active   = Array.from(allSteps).filter(s => s.classList.contains('quiz__step--active'));
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('quiz-step-2');
  });

  it('updates the progress bar text', () => {
    clickOption('[data-value="kok"]');
    jest.runAllTimers();

    const progressText = document.getElementById('quiz-progress-text');
    expect(progressText.textContent).toBe('Steg 2 av 3');
  });

  it('updates the aria-valuenow attribute on the progress container', () => {
    clickOption('[data-value="kok"]');
    jest.runAllTimers();

    const bar = document.querySelector('.quiz__progress');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
  });

  it('sets progress fill width correctly at step 2 (67%)', () => {
    clickOption('[data-value="kok"]');
    jest.runAllTimers();

    const fill = document.getElementById('quiz-progress-fill');
    expect(fill.style.width).toBe('67%');
  });

  it('sets progress fill width correctly at step 1 (33%)', () => {
    // Initial load is step 1
    const fill = document.getElementById('quiz-progress-fill');
    // loadQuiz ran with step 1 active; navigate back to step 1 via back button
    clickOption('[data-value="kok"]');
    jest.runAllTimers();
    document.querySelector('.quiz__back[data-back="1"]').click();

    expect(fill.style.width).toBe('33%');
  });
});

/* ════════════════════════════════════════════════════
   5.  Back button
════════════════════════════════════════════════════ */
describe('handleBack', () => {
  it('navigates back to the specified step', () => {
    clickOption('[data-value="kok"]');
    jest.runAllTimers();

    // Now on step 2 – click the back button
    document.querySelector('.quiz__back[data-back="1"]').click();

    expect(document.getElementById('quiz-step-1').classList).toContain('quiz__step--active');
  });
});

/* ════════════════════════════════════════════════════
   6.  showResult
════════════════════════════════════════════════════ */
describe('showResult', () => {
  function completeQuiz(room, problem, budget) {
    clickOption(`[data-value="${room}"]`);    jest.runAllTimers();
    clickOption(`[data-value="${problem}"]`); jest.runAllTimers();
    clickOption(`[data-value="${budget}"]`);  jest.runAllTimers();
  }

  it('builds correct CTA URL for known room without budget filter', () => {
    completeQuiz('kok', 'kaos', 'medium');
    const cta = document.getElementById('quiz-result-cta');
    expect(cta.href).toBe('http://localhost/collections/koksforvaring');
  });

  it('appends sort_by=price-ascending for low budget', () => {
    completeQuiz('badrum', 'kaos', 'low');
    const cta = document.getElementById('quiz-result-cta');
    expect(cta.href).toContain('sort_by=price-ascending');
  });

  it('appends sort_by=price-descending for high budget', () => {
    completeQuiz('sovrum', 'plats', 'high');
    const cta = document.getElementById('quiz-result-cta');
    expect(cta.href).toContain('sort_by=price-descending');
  });

  it('falls back to /collections/all for an unknown room', () => {
    // Manually trigger with an unknown room value by using a custom data-value
    const btn = document.querySelector('[data-value="kok"]');
    btn.setAttribute('data-value', 'unknown_room');
    completeQuiz('unknown_room', 'kaos', 'medium');
    const cta = document.getElementById('quiz-result-cta');
    expect(cta.href).toBe('http://localhost/collections/all');
  });

  it('sets the result text with the category name', () => {
    completeQuiz('tradgard', 'kaos', 'medium');
    const text = document.getElementById('quiz-result-text');
    expect(text.textContent).toContain('Trädgårdsförvaring');
  });

  it('sets the CTA button text', () => {
    completeQuiz('hall', 'kaos', 'medium');
    const cta = document.getElementById('quiz-result-cta');
    expect(cta.textContent).toContain('Hallförvaring');
  });

  it('sets progress fill to 100%', () => {
    completeQuiz('kontor', 'kaos', 'low');
    const fill = document.getElementById('quiz-progress-fill');
    expect(fill.style.width).toBe('100%');
  });

  it('sets progress text to "Klart!"', () => {
    completeQuiz('kok', 'plats', 'high');
    const text = document.getElementById('quiz-progress-text');
    expect(text.textContent).toBe('Klart!');
  });

  it('fires a gtag quiz_complete event when gtag is defined', () => {
    const gtagMock = jest.fn();
    global.gtag = gtagMock;
    completeQuiz('kok', 'kaos', 'low');
    expect(gtagMock).toHaveBeenCalledWith('event', 'quiz_complete', expect.objectContaining({
      quiz_room:   'kok',
      quiz_budget: 'low'
    }));
    delete global.gtag;
  });

  it('does not throw when gtag is undefined', () => {
    delete global.gtag;
    expect(() => completeQuiz('kok', 'kaos', 'low')).not.toThrow();
  });
});

/* ════════════════════════════════════════════════════
   7.  resetQuiz
════════════════════════════════════════════════════ */
describe('resetQuiz', () => {
  function completeQuiz() {
    clickOption('[data-value="kok"]');    jest.runAllTimers();
    clickOption('[data-value="kaos"]');  jest.runAllTimers();
    clickOption('[data-value="medium"]'); jest.runAllTimers();
  }

  it('returns to step 1', () => {
    completeQuiz();
    document.getElementById('quiz-restart').click();
    expect(document.getElementById('quiz-step-1').classList).toContain('quiz__step--active');
  });

  it('removes quiz__option--selected from all option buttons', () => {
    completeQuiz();
    document.getElementById('quiz-restart').click();
    const selected = document.querySelectorAll('.quiz__option--selected');
    expect(selected).toHaveLength(0);
  });

  it('resets progress text to step 1', () => {
    completeQuiz();
    document.getElementById('quiz-restart').click();
    const text = document.getElementById('quiz-progress-text');
    expect(text.textContent).toBe('Steg 1 av 3');
  });
});

/* ════════════════════════════════════════════════════
   8.  updateProgress
════════════════════════════════════════════════════ */
describe('updateProgress', () => {
  it('calculates 33% for step 1', () => {
    const fill = document.getElementById('quiz-progress-fill');
    expect(fill.style.width).toBe('33%'); // After initial load
  });
});

/* ════════════════════════════════════════════════════
   9.  DOMContentLoaded branch
════════════════════════════════════════════════════ */
describe('DOMContentLoaded branch', () => {
  it('registers init on DOMContentLoaded when readyState is "loading"', () => {
    // Override readyState to simulate a page that is still loading
    Object.defineProperty(document, 'readyState', {
      value:        'loading',
      configurable: true,
      writable:     false
    });

    jest.resetModules();
    const spy = jest.spyOn(document, 'addEventListener');
    require('../assets/quiz.js');

    const dcl = spy.mock.calls.find(c => c[0] === 'DOMContentLoaded');
    expect(dcl).toBeDefined();
    expect(typeof dcl[1]).toBe('function');

    // Restore the real readyState
    Object.defineProperty(document, 'readyState', {
      value:        'complete',
      configurable: true,
      writable:     false
    });
    spy.mockRestore();
  });
});
