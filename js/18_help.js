/**
 * SCMS v11 — 18_help.js
 * In-app help system:
 *   • renderHelp()        — full "How to use" page (opened from More menu)
 *   • startFirstTour()    — first-launch coachmark tour
 *   • maybeStartTour()    — runs the tour once for new users
 *
 * Bilingual (Burmese + English) — every string goes through t(), so the whole
 * page and the tour rebuild themselves when the language is switched.
 */

'use strict';

/* ────────────────────────────────────────────────────────────────────────
   HELP PAGE — "How to use SCMS"
   Opened via openHelpModal() from the More menu.
   ──────────────────────────────────────────────────────────────────────── */

window.openHelpModal = function () {
  const isAdmin = window.APP.is_admin;

  const html = `
    <div class="modal-sheet help-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>

      <div class="help-hero">
        <div class="help-hero-mark">S</div>
        <div>
          <h3 class="help-hero-title">${t('help.title')}</h3>
          <p class="help-hero-sub">${t('help.subtitle')}</p>
        </div>
      </div>

      <div class="help-tabs">
        <button class="help-tab active" onclick="switchHelpTab(this,'help-basics')">${t('help.tab.basics')}</button>
        <button class="help-tab" onclick="switchHelpTab(this,'help-features')">${t('help.tab.features')}</button>
        <button class="help-tab" onclick="switchHelpTab(this,'help-ai')">AI Chat</button>
        ${isAdmin ? `<button class="help-tab" onclick="switchHelpTab(this,'help-admin')">${t('help.tab.admin')}</button>` : ''}
        <button class="help-tab" onclick="switchHelpTab(this,'help-trouble')">${t('help.tab.trouble')}</button>
        <button class="help-tab" onclick="switchHelpTab(this,'help-about')">${t('help.tab.about')}</button>
      </div>

      <div class="help-body">

        <!-- BASICS -->
        <div class="help-pane active" id="help-basics">
          ${_helpSection('🏫', t('help.basics.introTitle'), t('help.basics.introBody'))}

          ${_helpStep('1', t('help.basics.step1Title'), t('help.basics.step1Body'))}
          ${_helpStep('2', t('help.basics.step2Title'), t('help.basics.step2Body'))}
          ${_helpStep('3', t('help.basics.step3Title'), t('help.basics.step3Body'))}
          ${_helpStep('4', t('help.basics.step4Title'), t('help.basics.step4Body'))}

          <div class="help-tip">
            <span class="help-tip-icon">💡</span>
            <span>${esc(t('help.basics.tip'))}</span>
          </div>
        </div>

        <!-- FEATURES -->
        <div class="help-pane" id="help-features">
          ${_helpFeature('👥', t('help.feat.students.title'), _helpPoints('help.feat.students', 4))}
          ${_helpFeature('✅', t('help.feat.attend.title'), _helpPoints('help.feat.attend', 5))}
          ${_helpFeature('📋', t('help.feat.daily.title'), _helpPoints('help.feat.daily', 3))}
          ${_helpFeature('📚', t('help.feat.hw.title'), _helpPoints('help.feat.hw', 4))}
          ${_helpFeature('💬', t('help.feat.msg.title'), _helpPoints('help.feat.msg', 3))}
          ${_helpFeature('⚡', t('help.feat.inc.title'), _helpPoints('help.feat.inc', 3))}
        </div>

        <!-- AI CHAT -->
        <div class="help-pane" id="help-ai">
          ${_helpSection('🤖', 'AI Smart Assistant', t('help.ai.introBody'))}

          <div class="help-ai-examples">
            <div class="help-ai-label">${t('help.ai.examplesLabel')}</div>
            ${_helpChat('teacher', t('help.ai.ex1'))}
            ${_helpChat('ai', t('help.ai.ex2'))}
            ${_helpChat('teacher', t('help.ai.ex3'))}
            ${_helpChat('ai', t('help.ai.ex4'))}
            ${_helpChat('teacher', t('help.ai.ex5'))}
            ${_helpChat('ai', t('help.ai.ex6'))}
            ${_helpChat('teacher', t('help.ai.ex7'))}
            ${_helpChat('ai', t('help.ai.ex8'))}
          </div>

          <div class="help-ai-label" style="margin-top:18px">📋 ${t('help.ai.cheatLabel')}</div>

          ${_helpCheat(t('help.ai.cheat.attend.title'), _helpPoints('help.ai.cheat.attend', 5))}
          ${_helpCheat(t('help.ai.cheat.hw.title'), _helpPoints('help.ai.cheat.hw', 4))}
          ${_helpCheat(t('help.ai.cheat.daily.title'), _helpPoints('help.ai.cheat.daily', 3))}
          ${_helpCheat(t('help.ai.cheat.inc.title'), _helpPoints('help.ai.cheat.inc', 3))}
          ${_helpCheat(t('help.ai.cheat.parent.title'), _helpPoints('help.ai.cheat.parent', 3))}
          ${_helpCheat(t('help.ai.cheat.query.title'), _helpPoints('help.ai.cheat.query', 4))}

          <div class="help-tip">
            <span class="help-tip-icon">⚡</span>
            <span><b>${t('help.ai.tip1').split(':')[0]}:</b>${t('help.ai.tip1').split(':').slice(1).join(':')}</span>
          </div>

          <div class="help-tip" style="background:rgba(245,158,11,0.08); border-color:rgba(245,158,11,0.3)">
            <span class="help-tip-icon">💡</span>
            <span><b>${t('help.ai.tip2').split(':')[0]}:</b>${t('help.ai.tip2').split(':').slice(1).join(':')}</span>
          </div>
        </div>

        <!-- TROUBLESHOOTING -->
        <div class="help-pane" id="help-trouble">
          ${_helpSection('🔧', t('help.trouble.introTitle'), t('help.trouble.introBody'))}

          ${_helpTrouble(t('help.trouble.q1'), t('help.trouble.a1'))}
          ${_helpTrouble(t('help.trouble.q2'), t('help.trouble.a2'))}
          ${_helpTrouble(t('help.trouble.q3'), t('help.trouble.a3'))}
          ${_helpTrouble(t('help.trouble.q4'), t('help.trouble.a4'))}
          ${_helpTrouble(t('help.trouble.q5'), t('help.trouble.a5'))}
          ${_helpTrouble(t('help.trouble.q6'), t('help.trouble.a6'))}

          <div class="help-tip">
            <span class="help-tip-icon">🆘</span>
            <span>${esc(t('help.trouble.tip'))}</span>
          </div>
        </div>

        ${isAdmin ? `
        <!-- ADMIN -->
        <div class="help-pane" id="help-admin">
          ${_helpSection('🛠️', t('help.admin.introTitle'), t('help.admin.introBody'))}
          ${_helpFeature('🖼️', t('help.admin.logo.title'), _helpPoints('help.admin.logo', 2))}
          ${_helpFeature('🏷️', t('help.admin.classes.title'), _helpPoints('help.admin.classes', 3))}
          ${_helpFeature('🗓️', t('help.admin.timetable.title'), _helpPoints('help.admin.timetable', 2))}
          ${_helpFeature('🏫', t('help.admin.reg.title'), _helpPoints('help.admin.reg', 2))}
        </div>` : ''}

        <!-- ABOUT -->
        <div class="help-pane" id="help-about">
          ${_helpSection('📱', t('help.about.introTitle'), t('help.about.introBody'))}
          <div class="help-about-rows">
            <div class="help-about-row"><span>${t('help.about.version')}</span><span>v${esc(SCMS_CONFIG.VERSION)}</span></div>
            <div class="help-about-row"><span>${t('help.about.platform')}</span><span>${esc(window.APP.platform)}</span></div>
            <div class="help-about-row"><span>${t('help.about.school')}</span><span>${esc(window.APP.school_name || '—')}</span></div>
          </div>
          ${_helpSection('🆘', t('help.about.needHelpTitle'), t('help.about.needHelpBody'))}
          <button class="help-replay-btn" onclick="closeModal(); setTimeout(startFirstTour, 300);">
            ${t('help.about.replayTour')}
          </button>
        </div>

      </div>

      <button class="btn-secondary" style="margin-top:14px" onclick="closeModal()">${t('help.close')}</button>
    </div>`;

  openModal(html);
};

window.switchHelpTab = function (btn, paneId) {
  document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.help-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(paneId)?.classList.add('active');
  // Scroll body to top
  document.querySelector('.help-body')?.scrollTo({ top: 0, behavior: 'smooth' });
};

// ── Help content builders ──────────────────────────────────────────────────
// Collects t('<prefix>.1') .. t('<prefix>.N') into an array of translated strings.
function _helpPoints(prefix, n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(t(`${prefix}.${i}`));
  return out;
}
function _helpSection(icon, title, text) {
  return `
    <div class="help-section">
      <div class="help-section-head"><span class="help-section-icon">${icon}</span><h4>${esc(title)}</h4></div>
      <p class="help-section-text">${esc(text)}</p>
    </div>`;
}
function _helpStep(num, title, text) {
  return `
    <div class="help-step">
      <div class="help-step-num">${num}</div>
      <div class="help-step-body">
        <div class="help-step-title">${esc(title)}</div>
        <div class="help-step-text">${esc(text)}</div>
      </div>
    </div>`;
}
function _helpFeature(icon, title, points) {
  return `
    <div class="help-feature">
      <div class="help-feature-head"><span class="help-feature-icon">${icon}</span><h4>${esc(title)}</h4></div>
      <ul class="help-feature-list">
        ${points.map(p => `<li>${esc(p)}</li>`).join('')}
      </ul>
    </div>`;
}
function _helpChat(who, text) {
  return `<div class="help-chat-row ${who}"><div class="help-chat-bubble">${esc(text)}</div></div>`;
}
function _helpCheat(title, examples) {
  return `
    <div class="help-cheat">
      <div class="help-cheat-title">${esc(title)}</div>
      <ul class="help-cheat-list">
        ${examples.map(e => `<li>${esc(e)}</li>`).join('')}
      </ul>
    </div>`;
}
function _helpTrouble(problem, solution) {
  return `
    <div class="help-trouble">
      <div class="help-trouble-q">❓ ${esc(problem)}</div>
      <div class="help-trouble-a">${esc(solution)}</div>
    </div>`;
}


/* ────────────────────────────────────────────────────────────────────────
   FIRST-LAUNCH TOUR — coachmark overlay
   ──────────────────────────────────────────────────────────────────────── */

const TOUR_KEY = 'scms_tour_done_v1';

// Built fresh from t() each time the tour starts, so it follows the current language.
function _tourSteps() {
  return [
    { title: t('tour.s1.title'), text: t('tour.s1.text'), target: null, emoji: '🏫' },
    { title: t('tour.s2.title'), text: t('tour.s2.text'), target: '.tab-btn[data-page="students"]', emoji: '👥' },
    { title: t('tour.s3.title'), text: t('tour.s3.text'), target: '.tab-btn[data-page="attend"]', emoji: '✅' },
    { title: t('tour.s4.title'), text: t('tour.s4.text'), target: '#fab', emoji: '➕' },
    { title: t('tour.s5.title'), text: t('tour.s5.text'), target: '.tab-btn[data-page="more"]', emoji: '⋯' },
  ];
}

window.maybeStartTour = function () {
  // Only in TWA or native — skip on landing/web preview; only once.
  try {
    if (localStorage.getItem(TOUR_KEY)) return;
  } catch (e) { /* localStorage disabled — show anyway */ }
  // Small delay so the UI has settled
  setTimeout(startFirstTour, 800);
};

let _tourIdx = 0;
let _tourStepsCache = [];

window.startFirstTour = function () {
  _tourIdx = 0;
  _tourStepsCache = _tourSteps();
  _renderTourStep();
};

function _renderTourStep() {
  _removeTour();
  const step = _tourStepsCache[_tourIdx];
  if (!step) { _finishTour(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  overlay.id = 'tourOverlay';

  // Spotlight on target (if any)
  let spotlightHtml = '';
  let cardPosClass = 'tour-card-center';
  if (step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 8;
      spotlightHtml = `
        <div class="tour-spotlight" style="
          left:${r.left - pad}px; top:${r.top - pad}px;
          width:${r.width + pad * 2}px; height:${r.height + pad * 2}px;">
        </div>`;
      // Position card above or below the target
      cardPosClass = r.top > window.innerHeight / 2 ? 'tour-card-above' : 'tour-card-below';
    }
  }

  overlay.innerHTML = `
    ${spotlightHtml}
    <div class="tour-card ${cardPosClass}">
      <div class="tour-emoji">${step.emoji}</div>
      <h3 class="tour-title">${esc(step.title)}</h3>
      <p class="tour-text">${esc(step.text)}</p>
      <div class="tour-dots">
        ${_tourStepsCache.map((_, i) => `<span class="tour-dot ${i === _tourIdx ? 'active' : ''}"></span>`).join('')}
      </div>
      <div class="tour-actions">
        <button class="tour-skip" onclick="skipTour()">${t('tour.skip')}</button>
        <button class="tour-next" onclick="nextTourStep()">
          ${_tourIdx === _tourStepsCache.length - 1 ? t('tour.done') : t('tour.next')}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
}

window.nextTourStep = function () {
  _tourIdx++;
  if (_tourIdx >= _tourStepsCache.length) { _finishTour(); return; }
  _renderTourStep();
};

window.skipTour = function () { _finishTour(); };

function _finishTour() {
  _removeTour();
  try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {}
}

function _removeTour() {
  document.getElementById('tourOverlay')?.remove();
}
