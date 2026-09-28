/**
 * SCMS v11 — 11_summary.js
 * Monthly summary cards.
 */

'use strict';

let _sumClass = 'All';

function renderSummary() {
  const el = document.getElementById('summaryClassChips');
  if (!el) return;

  const classes = ['All', ...[...new Set(
    window.APP.monthlySummary.map(s => s.class).filter(Boolean)
  )].sort()];

  el.innerHTML = classes.map(c =>
    `<button class="chip${c === _sumClass ? ' active' : ''}" data-class="${esc(c)}"
      onclick="filterSumClass('${esc(c)}')">${esc(c === 'All' ? t('common.all') : c)}</button>`
  ).join('');

  _renderSummaryList();
}

window.filterSumClass = function(cls) {
  _sumClass = cls;
  document.querySelectorAll('#summaryClassChips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.class === cls)
  );
  _renderSummaryList();
};

function _renderSummaryList() {
  const el = document.getElementById('summaryList');
  if (!el) return;

  let list = window.APP.monthlySummary;
  if (_sumClass !== 'All') list = list.filter(s => s.class === _sumClass);

  if (!list.length) {
    el.innerHTML = emptyState('📊', t('sum.none'), t('sum.noneSub'));
    return;
  }

  const gradeColor = { A:'#059669', B:'#0891B2', C:'#D97706', D:'#DC2626', F:'#7C3AED' };

  el.innerHTML = list.map(s => {
    const gColor = gradeColor[s.overall_grade?.toUpperCase()] || '#6B7280';
    return `
      <div class="list-card">
        <div class="card-row">
          <div class="card-info">
            <div class="card-name">${esc(s.name_en || s.student_id)}</div>
            <div class="card-sub">${esc(s.class || '—')} · ${t('sum.absent')} ${s.absent_days ?? '—'} ${t('sum.days')} · ${t('sum.hw')} ${s.hw_assigned ?? '—'}</div>
            ${s.notes ? `<div class="card-note">${esc(s.notes)}</div>` : ''}
          </div>
          ${s.overall_grade ? `<span class="grade-badge" style="color:${gColor}">${esc(s.overall_grade)}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}
