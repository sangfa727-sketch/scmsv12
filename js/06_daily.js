/**
 * SCMS v11 — 06_daily.js
 * Daily reports: list view + modal form + save via n8n TWA.
 * Same logic as v10 but uses the smart student picker when teacher taps + (FAB).
 */

'use strict';

let _dailyClass = null;

function renderDaily() {
  _renderDailyClassChips();
}

// ─── Class chips ──────────────────────────────────────────────────────────

function _renderDailyClassChips() {
  const el = document.getElementById('dailyClassChips');
  if (!el) return;

  const classes = [...new Set(
    window.APP.students.filter(s => s.status === 'Active').map(s => s.class).filter(Boolean)
  )].sort();

  if (!classes.length) {
    el.innerHTML = '';
    document.getElementById('dailyList').innerHTML = emptyState('📋', t('daily.noClasses'), t('daily.addStudentsFirst'));
    return;
  }

  if (!_dailyClass || !classes.includes(_dailyClass)) _dailyClass = classes[0];

  el.innerHTML = classes.map(c =>
    `<button class="chip${c === _dailyClass ? ' active' : ''}" data-class="${esc(c)}" onclick="selectDailyClass('${esc(c)}')">${esc(c)}</button>`
  ).join('');

  _renderDailyList(_dailyClass);
}

window.selectDailyClass = function(cls) {
  _dailyClass = cls;
  document.querySelectorAll('#dailyClassChips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.class === cls)
  );
  _renderDailyList(cls);
};

// ─── Daily report list ────────────────────────────────────────────────────

function _renderDailyList(cls) {
  const el = document.getElementById('dailyList');
  if (!el) return;

  const today = new Date().toISOString().slice(0, 10);
  const students = window.APP.students.filter(s => s.class === cls && s.status === 'Active');

  if (!students.length) {
    el.innerHTML = emptyState('📋', t('daily.noStudents', { cls }));
    return;
  }

  el.innerHTML = students.map(s => {
    const report = window.APP.dailyReports.find(
      r => r.date === today && (r.student_id === s.student_id || r.name_en === s.name_en)
    );

    const done = !!report;
    const mood = report?.mood || '';
    const moodMap = { Happy: '😊', OK: '😐', Tired: '😴', Sad: '😢', Energetic: '⚡' };
    const moodIcon = moodMap[mood] || mood;
    const homeHex = s.home_color ? homeColorHex(s.home_color) : '#4F46E5';

    return `
      <div class="list-card ${done ? 'card-done' : ''}" data-daily-id="${esc(report?.id || '')}">
        <div class="card-row">
          <div class="card-avatar" style="background:${homeHex}">${avatarContent(s)}</div>
          <div class="card-info">
            <div class="card-name">${esc(s.name_en || s.name_local)}</div>
            ${done
              ? `<div class="card-sub">${moodIcon} ${esc(tv('mood', mood))} · ${t('students.detail.meal')} ${esc(report.meal ? tv('meal', report.meal) : '—')} · ${t('daily.nap')} ${report.nap_min ?? '—'}${t('daily.min')}</div>`
              : `<div class="card-sub card-sub-pending">${t('daily.notFilled')}</div>`
            }
          </div>
          <div class="card-actions">
            <button class="btn-icon-round ${done ? 'btn-edit' : 'btn-add'}"
              onclick="openDailyModal('${esc(s.student_id)}','${esc(s.name_en || s.name_local)}')"
              title="${esc(t(done ? 'common.edit' : 'common.add'))}">
              ${done ? '✎' : '+'}
            </button>
            ${done && report?.id ? `<button class="icon-btn-mini danger" onclick="confirmDeleteDaily('${esc(report.id)}')" title="${esc(t('btn.delete'))}">🗑</button>` : ''}
          </div>
        </div>
        ${done && report.behaviour_note
          ? `<div class="card-note">${esc(report.behaviour_note)}</div>`
          : ''}
      </div>`;
  }).join('');
}

window.confirmDeleteDaily = function(id) {
  if (!confirm(t('daily.confirmDelete'))) return;
  doDeleteDaily(id);
};

async function doDeleteDaily(id) {
  try {
    await API.deleteDailyReport(id);
    window.APP.dailyReports = window.APP.dailyReports.filter(x => String(x.id) !== String(id));
    _renderDailyList(_dailyClass);
    showToast(t('common.deleted'));
  } catch (e) {
    showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
  }
}

// ─── Daily report modal ───────────────────────────────────────────────────

window.openDailyModal = function(studentId, studentName) {
  const existing = window.APP.dailyReports.find(
    r => r.date === new Date().toISOString().slice(0, 10) &&
         (r.student_id === studentId || r.name_en === studentName)
  );

  const meals     = ['Full', 'Half', 'Little', 'None'];
  const moods     = ['Happy', 'OK', 'Tired', 'Sad', 'Energetic'];
  const moodEmoji = { Happy:'😊', OK:'😐', Tired:'😴', Sad:'😢', Energetic:'⚡' };

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${esc(t('daily.modalTitle', { name: studentName }))}</h3>

      <label class="field-label">${t('daily.mealToday')}</label>
      <div class="pill-group" id="mealPills">
        ${meals.map(m => `
          <button type="button" class="pill ${existing?.meal === m ? 'active' : ''}"
            data-value="${esc(m)}" onclick="togglePill(this,'mealPills')">${esc(tv('meal', m))}</button>`).join('')}
      </div>

      <label class="field-label">${t('daily.napMin')}</label>
      <input class="form-input" id="napInput" type="number" min="0" max="180" step="5"
        value="${existing?.nap_min ?? 45}" placeholder="0–180">

      <label class="field-label">${t('daily.mood')}</label>
      <div class="pill-group" id="moodPills">
        ${moods.map(m => `
          <button type="button" class="pill ${existing?.mood === m ? 'active' : ''}"
            data-value="${esc(m)}" onclick="togglePill(this,'moodPills')">${moodEmoji[m]} ${esc(tv('mood', m))}</button>`).join('')}
      </div>

      <label class="field-label">${t('daily.behaviourNote')} <span class="optional">${t('common.optional')}</span></label>
      <textarea class="form-textarea" id="noteInput" rows="3"
        placeholder="${esc(t('daily.behaviourPh'))}">${esc(existing?.behaviour_note || '')}</textarea>

      <label class="field-label">${t('daily.toilet')} <span class="optional">${t('common.optional')}</span></label>
      <div class="pill-group" id="toiletPills">
        <button type="button" class="pill ${existing?.toilet_ok === true ? 'active' : ''}"
          data-value="Yes" onclick="togglePill(this,'toiletPills')">✓ ${t('enum.yesno.Yes')}</button>
        <button type="button" class="pill ${existing?.toilet_ok === false ? 'active' : ''}"
          data-value="No" onclick="togglePill(this,'toiletPills')">✗ ${t('enum.yesno.No')}</button>
      </div>

      <button class="btn-primary mt16" id="saveDailyBtn"
        onclick="saveDailyReport('${esc(studentId)}','${esc(studentName)}')">
        ${t('daily.save')}
      </button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>`;

  openModal(html);
};

window.togglePill = function(btn, groupId) {
  document.querySelectorAll(`#${groupId} .pill`).forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
};

window.saveDailyReport = async function(studentId, studentName) {
  const btn = document.getElementById('saveDailyBtn');
  const meal   = document.querySelector('#mealPills .pill.active')?.dataset.value || '';
  const napRaw = document.getElementById('napInput')?.value;
  const mood   = document.querySelector('#moodPills .pill.active')?.dataset.value || '';
  const note   = document.getElementById('noteInput')?.value.trim() || '';
  const _tp    = document.querySelector('#toiletPills .pill.active');
  const toilet = _tp ? _tp.dataset.value === 'Yes' : null;

  if (!meal) { showToast(t('daily.pickMeal')); return; }
  if (!mood) { showToast(t('daily.pickMood')); return; }

  btn.disabled = true;
  btn.textContent = t('common.saving');

  const stu = window.APP.students.find(s => s.student_id === studentId);
  const data = {
    student_id:     studentId,
    name_en:        studentName,
    class:          stu?.class || _dailyClass || '',
    date:           new Date().toISOString().slice(0, 10),
    meal,
    nap_min:        parseInt(napRaw, 10) || 0,
    mood,
    behaviour_note: note,
    toilet_ok:      toilet,
    teacher_id:     window.APP.teacher_id,
    school_id:      window.APP.school_id,
  };

  try {
    await API.saveDailyReport(data);

    window.APP.dailyReports = window.APP.dailyReports.filter(
      r => !(r.student_id === studentId && r.date === data.date)
    );
    window.APP.dailyReports.push(data);

    closeModal();
    _renderDailyList(_dailyClass);
    showToast(t('daily.saved', { name: studentName }));

    if (window.APP.tg?.HapticFeedback) {
      window.APP.tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = t('daily.save');
    showToast(t('att.saveFailed', { err: e.message || t('common.networkError') }));
  }
};

// FAB entry point — open the student picker first, then jump into the modal
window.openDailyReportModal = function() {
  openStudentPicker({
    title:       t('daily.pickerTitle'),
    subtitle:    t('daily.pickerSub', { date: new Date().toLocaleDateString(I18N.dateLocale(), { weekday:'long', month:'long', day:'numeric' }) }),
    classFilter: _dailyClass || 'All',
    onPick:      (s) => openDailyModal(s.student_id, s.name_en || s.name_local),
  });
};
