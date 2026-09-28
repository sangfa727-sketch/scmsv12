/**
 * SCMS v11 — js/28_leave_requests.js
 * Teacher-side view of parent-submitted leave requests. Manual
 * approve/reject only — this is intentionally NOT wired to n8n/AI.
 * Saii's stated plan: when n8n + an AI staff-chat layer is added
 * later, it can call the SAME two RPCs (API.getLeaveRequests /
 * API.decideLeaveRequest) that this manual UI calls — the RPC
 * surface is shared between a human tapping buttons today and an
 * automated caller later, nothing here needs to be rebuilt for that.
 *
 * Reuses real app components throughout: .stats-grid/.stat-card,
 * .list-card/.card-row/.card-avatar/.card-info/.card-name/.card-sub,
 * .chips-row/.chip (status filter), showConfirm(), showToast(),
 * emptyState(), esc(), avatarContent(), t().
 */

'use strict';

let _leaveRequestsAll   = [];
let _leaveRequestFilter = 'Pending'; // Pending | Approved | Rejected | all

async function renderLeaveRequests() {
  const container = document.getElementById('leaveRequestsContent');
  if (!container) return;

  container.innerHTML = `<div class="skeleton-loading">${t('leave.loading')}</div>`;
  try {
    _leaveRequestsAll = await API.getLeaveRequests();
    _paintLeaveRequests(container);
  } catch (e) {
    container.innerHTML = emptyState('⚠️', t('common.failed'), e.message || t('common.error'));
  }
}

function _paintLeaveRequests(container) {
  const counts = { Pending: 0, Approved: 0, Rejected: 0 };
  for (const r of _leaveRequestsAll) counts[r.status] = (counts[r.status] || 0) + 1;

  const rows = _leaveRequestFilter === 'all'
    ? _leaveRequestsAll
    : _leaveRequestsAll.filter(r => r.status === _leaveRequestFilter);

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card${counts.Pending ? '' : ' muted'}">
        <div class="stat-num">${counts.Pending}</div>
        <div class="stat-lbl">${t('leave.status.Pending')}</div>
      </div>
      <div class="stat-card green"><div class="stat-num">${counts.Approved}</div><div class="stat-lbl">${t('leave.status.Approved')}</div></div>
      <div class="stat-card red"><div class="stat-num">${counts.Rejected}</div><div class="stat-lbl">${t('leave.status.Rejected')}</div></div>
    </div>

    <div class="chips-row" id="leaveFilterChips">
      ${['Pending', 'Approved', 'Rejected', 'all'].map(s => `
        <button class="chip${_leaveRequestFilter === s ? ' active' : ''}" data-filter="${s}" onclick="setLeaveFilter('${s}')">
          ${s === 'all' ? t('common.all') || 'All' : t('leave.status.' + s)}
        </button>`).join('')}
    </div>

    ${rows.length ? rows.map(r => `
      <div class="list-card">
        <div class="card-row">
          <div class="card-avatar">${avatarContent({ name_en: r.name_en })}</div>
          <div class="card-info">
            <div class="card-name">${esc(r.name_en)} <span class="class-tag">${esc(r.class || '')}</span></div>
            <div class="card-sub">${esc(_fmtDateRange(r.start_date, r.end_date))} ${r.reason ? '· ' + esc(r.reason) : ''}</div>
            ${r.status !== 'Pending' ? `<div class="card-sub">${t('leave.status.' + r.status)}${r.teacher_note ? ' — ' + esc(r.teacher_note) : ''}</div>` : ''}
          </div>
          ${r.status === 'Pending' ? `
          <div class="card-actions">
            <button class="btn-pill-action ghost" onclick="_leaveReject(${r.id})">${t('leave.reject')}</button>
            <button class="btn-pill-action" onclick="_leaveApprove(${r.id})">${t('leave.approve')}</button>
          </div>` : ''}
        </div>
      </div>`).join('') : emptyState('📭', t('leave.empty'))}
  `;
}

window.setLeaveFilter = function (status) {
  _leaveRequestFilter = status;
  const container = document.getElementById('leaveRequestsContent');
  if (container) _paintLeaveRequests(container); // re-render from cache, no re-fetch
};

window._leaveApprove = function (id) {
  showConfirm(t('leave.approveTitle'), t('leave.approveMsg'), t('leave.approve'), async () => {
    await _decide(id, 'Approved');
  }, { danger: false });
};

window._leaveReject = function (id) {
  showConfirm(t('leave.rejectTitle'), t('leave.rejectMsg'), t('leave.reject'), async () => {
    await _decide(id, 'Rejected');
  });
};

async function _decide(id, decision) {
  try {
    const res = await API.decideLeaveRequest(id, decision);
    showToast(t('leave.decided', { status: t('leave.status.' + decision), n: res.days_marked ?? 0 }));
    if (typeof window.APP.pendingLeaveCount === 'number') {
      window.APP.pendingLeaveCount = Math.max(0, window.APP.pendingLeaveCount - 1);
      if (typeof renderSidebar === 'function') renderSidebar();
    }
    renderLeaveRequests();
  } catch (e) {
    showToast(t('leave.decideFailed') + ': ' + (e.message || t('common.error')));
  }
}

function _fmtDateRange(start, end) {
  return start === end ? start : `${start} → ${end}`;
}
