/**
 * SCMS v11 — 07_homework.js
 * Homework log: list by class, add homework modal, save via n8n TWA.
 */

'use strict';

let _hwClass = null;

function renderHomework() {
  const el = document.getElementById('hwClassChips');
  if (!el) return;

  const classes = [...new Set(
    window.APP.students.filter(s => s.status === 'Active').map(s => s.class).filter(Boolean)
  )].sort();

  if ((!_hwClass || !classes.includes(_hwClass)) && classes.length) _hwClass = classes[0];

  el.innerHTML = classes.map(c =>
    `<button class="chip${c === _hwClass ? ' active' : ''}" data-class="${esc(c)}" onclick="selectHwClass('${esc(c)}')">${esc(c)}</button>`
  ).join('');

  _renderHwList();
}

window.selectHwClass = function(cls) {
  _hwClass = cls;
  document.querySelectorAll('#hwClassChips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.class === cls)
  );
  _renderHwList();
};

function _renderHwList() {
  const el = document.getElementById('hwList');
  if (!el) return;

  const list = window.APP.homework
    .filter(h => !_hwClass || h.class === _hwClass)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!list.length) {
    el.innerHTML = emptyState('📚', t('hw.none'), t('hw.tapAdd'));
    return;
  }

  const typeColors = { Homework:'#4F46E5', Lesson:'#0891B2', Test:'#DC2626', Quiz:'#D97706', Project:'#059669' };

  el.innerHTML = list.map(h => {
    const color = typeColors[h.type] || '#6B7280';
    return `
      <div class="list-card" data-hw-id="${esc(h.id)}">
        <div class="card-row">
          <div class="hw-type-dot" style="background:${color}"></div>
          <div class="card-info">
            <div class="card-name">${esc(h.subject ? tv('subject', h.subject) : '—')} <span class="type-tag" style="color:${color}">${esc(h.type ? tv('hwType', h.type) : '')}</span></div>
            <div class="card-sub">${esc(h.class || '—')} · ${esc(h.date || '—')}${h.due_date ? ' · ' + t('hw.due') + ' ' + esc(h.due_date) : ''}</div>
            ${h.description ? `<div class="card-note">${esc(h.description)}</div>` : ''}
          </div>
          <div class="card-actions">
            <button class="icon-btn-mini" onclick="openEditHomework('${esc(h.id)}')" title="${esc(t('common.edit'))}">✎</button>
            <button class="icon-btn-mini danger" onclick="confirmDeleteHomework('${esc(h.id)}')" title="${esc(t('btn.delete'))}">🗑</button>
          </div>
        </div>
        ${h.lb_page || h.wb_page ? `
          <div class="hw-pages">
            ${h.lb_page ? `📖 ${esc(t('hw.lb', { n: h.lb_page }))}` : ''}
            ${h.wb_page ? `📔 ${esc(t('hw.wb', { n: h.wb_page }))}` : ''}
          </div>` : ''}
      </div>`;
  }).join('');
}

window.openHomeworkModal = async function() {
  const subjectRows = await _ensureSubjectsLoaded();
  const subjects = subjectRows.length
    ? subjectRows.map(s => s.subject_name)
    : ['Mathematics', 'English', 'Science', 'Social Studies'];
  const types    = window.APP.config?.homework_types || ['Homework','Lesson','Test','Quiz','Project','Worksheet'];
  const classes  = [...new Set(window.APP.students.map(s => s.class).filter(Boolean))].sort();

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('hw.addTitle')}</h3>

            <label class="field-label">${t('hw.subject')}</label>
      <select class="form-input" id="hwSubject" onchange="handleSubjectSelectChange(this)">
        ${subjects.map(s => `<option value="${esc(s)}">${esc(tv('subject', s))}</option>`).join('')}
        <option value="__add__">${t('hw.addSubject')}</option>
      </select>

      <label class="field-label">${t('hw.class')}</label>
      <select class="form-input" id="hwClass">
        ${classes.map(c => `<option ${c === _hwClass ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>

      <label class="field-label">${t('hw.type')}</label>
      <div class="pill-group" id="hwTypePills">
        ${types.map((ty, i) => `<button type="button" class="pill ${i===0?'active':''}" data-value="${esc(ty)}" onclick="togglePill(this,'hwTypePills')">${esc(tv('hwType', ty))}</button>`).join('')}
      </div>

      <label class="field-label">${t('hw.description')}</label>
      <textarea class="form-textarea" id="hwDesc" rows="2" placeholder="${esc(t('hw.descPh'))}"></textarea>

      <div class="form-row">
        <div class="form-col">
          <label class="field-label">${t('hw.lbPage')} <span class="optional">${t('common.opt')}</span></label>
          <input class="form-input" id="hwLb" placeholder="${esc(t('hw.pagePh1'))}">
        </div>
        <div class="form-col">
          <label class="field-label">${t('hw.wbPage')} <span class="optional">${t('common.opt')}</span></label>
          <input class="form-input" id="hwWb" placeholder="${esc(t('hw.pagePh2'))}">
        </div>
      </div>

      <label class="field-label">${t('hw.dueDate')} <span class="optional">${t('common.optional')}</span></label>
      <input class="form-input" id="hwDue" type="date">

      <button class="btn-primary mt16" id="saveHwBtn" onclick="saveHomework()">${t('btn.save')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>`;

  openModal(html);
};

window.saveHomework = async function() {
  const btn = document.getElementById('saveHwBtn');
  btn.disabled = true; btn.textContent = t('common.saving');

  try {
    const data = {
      subject:     document.getElementById('hwSubject').value,
      class:       document.getElementById('hwClass').value,
      type:        document.querySelector('#hwTypePills .pill.active')?.dataset.value || 'Homework',
      description: document.getElementById('hwDesc').value.trim(),
      lb_page:     document.getElementById('hwLb').value.trim(),
      wb_page:     document.getElementById('hwWb').value.trim(),
      due_date:    document.getElementById('hwDue').value || null,
      date:        new Date().toISOString().slice(0, 10),
      teacher_id:  window.APP.teacher_id,
      school_id:   window.APP.school_id,
    };

        const res = await API.saveHomework(data);
    window.APP.homework.unshift(res?.homework || data);

    closeModal();
    _renderHwList();
    showToast(t('hw.saved'));
    if (window.APP.tg?.HapticFeedback) window.APP.tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    btn.disabled = false; btn.textContent = t('btn.save');
    showToast(t('att.saveFailed', { err: e.message || t('common.error') }));
  }
};

/* ─── Edit + Delete ─────────────────────────────────────────────── */

window.openEditHomework = async function(id) {
  const h = window.APP.homework.find(x => String(x.id) === String(id));
  if (!h) { showToast(t('common.itemNotFound')); return; }
  const subjectRows = await _ensureSubjectsLoaded();
  const subjects = subjectRows.length
    ? subjectRows.map(s => s.subject_name)
    : ['Mathematics', 'English', 'Science', 'Social Studies'];
  const types    = window.APP.config?.homework_types || ['Homework','Lesson','Test','Quiz','Project','Worksheet'];
  const classes  = [...new Set(window.APP.students.map(s => s.class).filter(Boolean))].sort();

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('hw.editTitle')}</h3>

            <label class="field-label">${t('hw.subject')}</label>
      <select class="form-input" id="ehwSubject" onchange="handleSubjectSelectChange(this)">
        ${subjects.map(s => `<option value="${esc(s)}" ${s===h.subject?'selected':''}>${esc(tv('subject', s))}</option>`).join('')}
        <option value="__add__">${t('hw.addSubject')}</option>
      </select>

      <label class="field-label">${t('hw.class')}</label>
      <select class="form-input" id="ehwClass">
        ${classes.map(c => `<option ${c===h.class?'selected':''}>${esc(c)}</option>`).join('')}
      </select>

      <label class="field-label">${t('hw.type')}</label>
      <div class="pill-group" id="ehwTypePills">
        ${types.map(ty => `<button type="button" class="pill ${ty===h.type?'active':''}" data-value="${esc(ty)}" onclick="togglePill(this,'ehwTypePills')">${esc(tv('hwType', ty))}</button>`).join('')}
      </div>

      <label class="field-label">${t('hw.description')}</label>
      <textarea class="form-textarea" id="ehwDesc" rows="2">${esc(h.description || '')}</textarea>

      <div class="form-row">
        <div class="form-col">
          <label class="field-label">${t('hw.lbPage')}</label>
          <input class="form-input" id="ehwLb" value="${esc(h.lb_page || '')}">
        </div>
        <div class="form-col">
          <label class="field-label">${t('hw.wbPage')}</label>
          <input class="form-input" id="ehwWb" value="${esc(h.wb_page || '')}">
        </div>
      </div>

      <label class="field-label">${t('hw.dueDate')}</label>
      <input class="form-input" id="ehwDue" type="date" value="${esc(h.due_date || '')}">

      <button class="btn-primary mt16" id="saveEhwBtn" onclick="saveEditHomework('${esc(id)}')">${t('common.saveChanges')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window.saveEditHomework = async function(id) {
  const btn = document.getElementById('saveEhwBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    const patch = {
      subject:     document.getElementById('ehwSubject').value,
      class:       document.getElementById('ehwClass').value,
      type:        document.querySelector('#ehwTypePills .pill.active')?.dataset.value || 'Homework',
      description: document.getElementById('ehwDesc').value.trim(),
      lb_page:     document.getElementById('ehwLb').value.trim() || null,
      wb_page:     document.getElementById('ehwWb').value.trim() || null,
      due_date:    document.getElementById('ehwDue').value || null,
    };
    const res = await API.updateHomework(id, patch);
    // Update local cache
    const idx = window.APP.homework.findIndex(x => String(x.id) === String(id));
    if (idx >= 0) window.APP.homework[idx] = { ...window.APP.homework[idx], ...patch };
    closeModal();
    _renderHwList();
    showToast(t('hw.updated'));
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.saveChanges');
    showToast(t('common.updateFailed', { err: e.message || t('common.error') }));
  }
};

window.confirmDeleteHomework = function(id) {
  showConfirm(
    t('hw.confirmTitle'),
    t('hw.confirmBody'),
    t('btn.delete'),
    () => doDeleteHomework(id)
  );
};
async function doDeleteHomework(id) {
  try {
    await API.deleteHomework(id);
    window.APP.homework = window.APP.homework.filter(x => String(x.id) !== String(id));
    _renderHwList();
    showToast(t('common.deleted'));
  } catch (e) {
    showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
  }
}

/* ─── Add a new subject (from the Subject picker) ──────────────────── */
/* openAddSubjectPrompt / _confirmAddSubject / _ensureSubjectsLoaded now
 * live in 03_utils.js, shared with the Grades page. */

window.handleSubjectSelectChange = function(sel) {
  if (sel.value !== '__add__') return;
  const opts = [...sel.options].filter(o => o.value !== '__add__');
  sel.value = opts[0]?.value || '';
  openAddSubjectPrompt((newSubj) => {
    const s = document.getElementById(sel.id);
    if (!s) return;
    const names = (window.APP.subjectsCache || []).map(x => x.subject_name);
    s.innerHTML = names.map(n => `<option value="${esc(n)}"${n === newSubj.subject_name ? ' selected' : ''}>${esc(tv('subject', n))}</option>`).join('')
      + `<option value="__add__">${t('hw.addSubject')}</option>`;
  });
};
