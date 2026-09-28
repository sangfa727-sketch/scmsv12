/**
 * SCMS v11 — 20_grades.js
 * Grading & Assessment: pick a term/subject/class, list assessments for
 * that combination, create new ones, and enter scores in bulk. Percentage
 * and letter grade are computed server-side (rpc_save_grades) from the
 * assessment's max_score and the school's config_json.grade_scale.
 *
 * Web only for now — this is a new feature with no n8n/Telegram equivalent
 * yet, unlike the other pages which have a twaPost fallback.
 */

'use strict';

let _gradesTermId      = null;
let _gradesSubjectId   = null;
let _gradesClass       = null;
let _gradesTerms       = [];
let _gradesSubjects    = [];
let _gradesAssessments = [];

async function renderGrades() {
  const listEl = document.getElementById('gradesAssessmentList');
  if (listEl) listEl.innerHTML = skeletonCards(2);

  try {
    const [terms, subjects] = await Promise.all([API.getTerms(), _ensureSubjectsLoaded()]);
    _gradesTerms    = terms || [];
    _gradesSubjects = subjects || [];
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  if ((!_gradesTermId || !_gradesTerms.some(t => t.id === _gradesTermId)) && _gradesTerms.length) {
    _gradesTermId = (_gradesTerms.find(t => t.is_current) || _gradesTerms[0]).id;
  }
  if ((!_gradesSubjectId || !_gradesSubjects.some(s => s.id === _gradesSubjectId)) && _gradesSubjects.length) {
    _gradesSubjectId = _gradesSubjects[0].id;
  }

  const classes = [...new Set(
    (window.APP.students || []).filter(s => s.status === 'Active').map(s => s.class).filter(Boolean)
  )].sort();
  if ((!_gradesClass || !classes.includes(_gradesClass)) && classes.length) _gradesClass = classes[0];

  _renderGradesFilters(classes);
  await _loadAndRenderAssessments();
}

function _renderGradesFilters(classes) {
  const termEl = document.getElementById('gradesTermPicker');
  const subjEl = document.getElementById('gradesSubjectPicker');
  const clsEl  = document.getElementById('gradesClassPicker');
  if (!termEl || !subjEl || !clsEl) return;

  termEl.innerHTML = _gradesTerms.length
    ? `<div class="attend-class-select-wrap">
         <select class="attend-class-select" onchange="selectGradesTerm(this.value)">
           ${_gradesTerms.map(tm => `<option value="${tm.id}"${tm.id === _gradesTermId ? ' selected' : ''}>${esc(tm.term_name)}${tm.is_current ? ' ' + t('grades.current') : ''}</option>`).join('')}
         </select>
       </div>`
    : `<button class="btn-pill-action ghost" onclick="openAddTermPrompt()">${t('grades.addTerm')}</button>`;

  subjEl.innerHTML = `
    <div class="attend-class-select-wrap">
      <select class="attend-class-select" onchange="handleGradesSubjectChange(this)">
        ${_gradesSubjects.map(s => `<option value="${s.id}"${s.id === _gradesSubjectId ? ' selected' : ''}>${esc(tv('subject', s.subject_name))}</option>`).join('')}
        <option value="__add__">${t('hw.addSubject')}</option>
      </select>
    </div>`;

  clsEl.innerHTML = classes.length
    ? classes.map(c => `<button class="chip${c === _gradesClass ? ' active' : ''}" onclick="selectGradesClass('${esc(c)}')">${esc(c)}</button>`).join('')
    : `<span class="chip-empty">${t('daily.addStudentsFirst')}</span>`;
}

window.selectGradesTerm = function(id) {
  _gradesTermId = Number(id);
  _loadAndRenderAssessments();
};

window.handleGradesSubjectChange = function(sel) {
  if (sel.value === '__add__') {
    const opts = [...sel.options].filter(o => o.value !== '__add__');
    sel.value = opts[0]?.value || '';
    openAddSubjectPrompt((newSubj) => {
      _gradesSubjectId = newSubj.id;
      renderGrades();
    });
    return;
  }
  _gradesSubjectId = Number(sel.value);
  _loadAndRenderAssessments();
};

window.selectGradesClass = function(cls) {
  _gradesClass = cls;
  document.querySelectorAll('#gradesClassPicker .chip').forEach(b =>
    b.classList.toggle('active', b.textContent.trim() === cls));
  _loadAndRenderAssessments();
};

async function _loadAndRenderAssessments() {
  const el = document.getElementById('gradesAssessmentList');
  if (!el) return;

  const toolbar = `
    <div class="attend-toolbar">
      <button class="btn-pill-action ghost" onclick="openReportCard()">
        ${t('grades.reportCard')}
      </button>
    </div>`;

  if (!_gradesClass) {
    el.innerHTML = toolbar + `<div class="empty-state">${t('grades.noClasses')}</div>`;
    return;
  }

  el.innerHTML = toolbar + skeletonCards(2);
  try {
    _gradesAssessments = await API.getAssessments({
      class: _gradesClass, subject_id: _gradesSubjectId, term_id: _gradesTermId,
    });
  } catch (e) {
    el.innerHTML = toolbar + `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  if (!_gradesAssessments.length) {
    el.innerHTML = toolbar + `<div class="empty-state">${t('grades.noAssessments')}</div>`;
    return;
  }

  el.innerHTML = toolbar + _gradesAssessments.map(a => `
    <div class="list-card" onclick="openGradeEntry(${a.id})">
      <div class="card-row">
        <div class="card-info">
          <div class="card-name">${esc(a.title)} <span class="type-tag">${esc(tv('assessType', a.type))}</span></div>
          <div class="card-sub">${esc(t('grades.metaLine', { date: fmtDate(a.date), max: a.max_score, w: a.weight }))}</div>
        </div>
        <div class="card-actions">
          <button class="icon-btn-mini danger" onclick="event.stopPropagation();confirmDeleteAssessment(${a.id})" title="${esc(t('btn.delete'))}">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

/* ─── Report card (term-end weighted average per subject + overall) ────── */

window.openReportCard = async function() {
  if (!_gradesTermId) { showToast(t('grades.pickTerm')); return; }
  if (!_gradesClass)  { showToast(t('grades.pickClass')); return; }

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:640px;max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('grades.reportTitle')}</h3>
      <p class="modal-subtitle">${esc(_gradesClass)} · ${esc(_gradesTerms.find(t => t.id === _gradesTermId)?.term_name || '')}</p>
      <div id="reportCardBody">${skeletonCards(2)}</div>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>
  `);

  const body = document.getElementById('reportCardBody');
  let students;
  try {
    const res = await API.getReportCard(_gradesTermId, _gradesClass);
    students = res?.students || [];
  } catch (e) {
    if (body) body.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  if (!body) return;
  if (!students.length) {
    body.innerHTML = `<div class="empty-state">${t('grades.noGraded')}</div>`;
    return;
  }

  const subjectNames = [...new Set(
    students.flatMap(s => (s.subjects || []).map(sub => sub.subject_name))
  )].sort();

  const rows = students.map(s => {
    const bySubject = Object.fromEntries((s.subjects || []).map(sub => [sub.subject_name, sub]));
    const cells = subjectNames.map(name => {
      const sub = bySubject[name];
      return `<td>${sub ? `${sub.pct}% <span class="report-letter">${esc(sub.letter)}</span>` : '—'}</td>`;
    }).join('');
    const overall = s.overall_pct != null
      ? `${s.overall_pct}% <span class="report-letter">${esc(s.overall_letter)}</span>`
      : '—';
    return `<tr><td class="report-name">${esc(s.name_en)}</td>${cells}<td class="report-overall">${overall}</td></tr>`;
  }).join('');

  body.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>${t('grades.thStudent')}</th>
            ${subjectNames.map(n => `<th>${esc(tv('subject', n))}</th>`).join('')}
            <th>${t('grades.overall')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
};

/* ─── New assessment ─────────────────────────────────────────────── */

window.openNewAssessmentModal = function() {
  if (!_gradesClass) { showToast(t('grades.pickClass')); return; }

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('grades.newTitle')}</h3>
      <p class="modal-subtitle">${esc(_gradesClass)}</p>

      <label class="field-label">${t('grades.title')}</label>
      <input class="form-input" id="gaTitle" placeholder="${esc(t('grades.titlePh'))}">

      <label class="field-label">${t('grades.type')}</label>
      <div class="pill-group" id="gaTypePills">
        ${['Quiz', 'Test', 'Exam', 'Assignment', 'Project'].map((ty, i) =>
          `<button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${ty}" onclick="togglePill(this,'gaTypePills')">${esc(tv('assessType', ty))}</button>`
        ).join('')}
      </div>

      <div class="form-row">
        <div class="form-col">
          <label class="field-label">${t('grades.maxScore')}</label>
          <input class="form-input" id="gaMax" type="number" value="100" min="1">
        </div>
        <div class="form-col">
          <label class="field-label">${t('grades.weight')}</label>
          <input class="form-input" id="gaWeight" type="number" value="10" min="0" max="100">
        </div>
      </div>

      <label class="field-label">${t('grades.date')}</label>
      <input class="form-input" id="gaDate" type="date" value="${new Date().toISOString().slice(0, 10)}">

      <button class="btn-primary mt16" id="gaSaveBtn" onclick="saveNewAssessment()">${t('grades.create')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window.saveNewAssessment = async function() {
  const btn   = document.getElementById('gaSaveBtn');
  const title = document.getElementById('gaTitle').value.trim();
  if (!title) { showToast(t('grades.enterTitle')); return; }

  btn.disabled = true; btn.textContent = t('grades.creating');
  try {
    const res = await API.createAssessment({
      term_id:    _gradesTermId,
      subject_id: _gradesSubjectId,
      class:      _gradesClass,
      title,
      type:       document.querySelector('#gaTypePills .pill.active')?.dataset.value || 'Assignment',
      max_score:  Number(document.getElementById('gaMax').value) || 100,
      weight:     Number(document.getElementById('gaWeight').value) || 0,
      date:       document.getElementById('gaDate').value || null,
    });
    closeModal();
    showToast(t('grades.created'));
    await _loadAndRenderAssessments();
    if (res?.assessment?.id) openGradeEntry(res.assessment.id);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('grades.create');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window.confirmDeleteAssessment = function(id) {
  showConfirm(
    t('grades.confirmTitle'),
    t('grades.confirmBody'),
    t('btn.delete'),
    async () => {
      try {
        await API.deleteAssessment(id);
        showToast(t('common.deleted'));
        await _loadAndRenderAssessments();
      } catch (e) {
        showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
      }
    }
  );
};

/* ─── Score entry ─────────────────────────────────────────────────── */

window.openGradeEntry = async function(assessmentId) {
  const a = _gradesAssessments.find(x => x.id === assessmentId);
  if (!a) return;

  const students = (window.APP.students || [])
    .filter(s => s.class === a.class && s.status === 'Active')
    .sort((x, y) => (x.name_en || '').localeCompare(y.name_en || ''));

  let existing = [];
  try { existing = await API.getGrades(assessmentId); } catch (e) { /* fresh assessment, no grades yet */ }
  const byStudent = Object.fromEntries(existing.map(g => [g.student_id, g]));

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${esc(a.title)}</h3>
      <p class="modal-subtitle">${esc(t('grades.classMax', { cls: a.class, max: a.max_score }))}</p>

      <div id="gradeEntryRows">
        ${students.map(s => {
          const g = byStudent[s.student_id];
          return `
            <div class="grade-entry-row" data-student="${esc(s.student_id)}">
              <div class="grade-entry-name">${esc(s.name_en || s.name_local || s.student_id)}</div>
              <input class="form-input grade-entry-score" type="number" min="0" max="${esc(String(a.max_score))}"
                placeholder="—" value="${g && g.score != null ? esc(String(g.score)) : ''}"
                oninput="_updateGradePreview(this, ${Number(a.max_score) || 0})">
              <div class="grade-entry-pct">${g && g.letter_grade ? `${g.percentage}% · ${esc(g.letter_grade)}` : ''}</div>
            </div>`;
        }).join('')}
      </div>

      <button class="btn-primary mt16" id="gradeSaveBtn" onclick="saveGradeEntry(${assessmentId})">${t('grades.saveScores')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._updateGradePreview = function(input, maxScore) {
  const row   = input.closest('.grade-entry-row');
  const pctEl = row.querySelector('.grade-entry-pct');
  const v     = parseFloat(input.value);
  if (isNaN(v) || !maxScore) { pctEl.textContent = ''; return; }
  const pct = Math.round((v / maxScore) * 1000) / 10;
  pctEl.textContent = `${pct}%`;
};

window.saveGradeEntry = async function(assessmentId) {
  const btn  = document.getElementById('gradeSaveBtn');
  const rows = document.querySelectorAll('#gradeEntryRows .grade-entry-row');
  const records = [...rows].map(row => ({
    student_id: row.dataset.student,
    score:      row.querySelector('.grade-entry-score').value || null,
    comment:    null,
  })).filter(r => r.score !== null && r.score !== '');

  if (!records.length) { showToast(t('grades.enterOne')); return; }

  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    await API.saveGrades(assessmentId, records);
    closeModal();
    showToast(t('grades.scoresSaved'));
  } catch (e) {
    btn.disabled = false; btn.textContent = t('grades.saveScores');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Add a term (shown when none exist yet) ───────────────────────── */

window.openAddTermPrompt = function() {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:360px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('grades.addTermTitle')}</h3>
      <label class="field-label">${t('grades.termName')}</label>
      <input class="form-input" id="newTermName" placeholder="${esc(t('grades.termNamePh'))}">
      <label class="field-label">${t('grades.year')}</label>
      <input class="form-input" id="newTermYear" placeholder="${esc(t('grades.yearPh'))}">
      <div class="form-row">
        <div class="form-col">
          <label class="field-label">${t('grades.start')}</label>
          <input class="form-input" id="newTermStart" type="date">
        </div>
        <div class="form-col">
          <label class="field-label">${t('grades.end')}</label>
          <input class="form-input" id="newTermEnd" type="date">
        </div>
      </div>
      <button class="btn-primary mt16" id="addTermBtn" onclick="_confirmAddTerm()">${t('common.add')}</button>
      <button class="btn-secondary mt8" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._confirmAddTerm = async function() {
  const name = document.getElementById('newTermName').value.trim();
  if (!name) { showToast(t('grades.enterTermName')); return; }

  const btn = document.getElementById('addTermBtn');
  btn.disabled = true; btn.textContent = t('subject.adding');
  try {
    await API.addTerm({
      term_name:     name,
      academic_year: document.getElementById('newTermYear').value.trim() || null,
      start_date:    document.getElementById('newTermStart').value || null,
      end_date:      document.getElementById('newTermEnd').value || null,
      term_order:    (_gradesTerms.length || 0) + 1,
      is_current:    _gradesTerms.length === 0,
    });
    closeModal();
    showToast(t('grades.termAdded'));
    renderGrades();
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.add');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};
