/**
 * SCMS v11 — js/27_dashboard.js
 * "Today at a Glance" teacher dashboard.
 *
 * v2 (2026-09-27 revision): rebuilt to REUSE the app's existing
 * components instead of inventing parallel ones — .stats-grid/
 * .stat-card (same as Students), .list-card/.card-row/.card-avatar
 * (same as Students), .chips-row/.chip (same class filter used on
 * Students), emptyState()/avatarContent()/esc() globals. The
 * page-header (eyebrow + Fraunces page-title) is already in
 * index.html, so this only ever renders into #dashboardContent —
 * it does not render its own h2/title.
 *
 * Data-model notes (unchanged from v1, still true):
 * - homework_log has no per-student submission tracking, so this
 *   shows "homework logged recently", not "who hasn't submitted".
 * - parent_comms is outbound-only logging, so this shows "N stuck
 *   in Queued" (meaningful while the Telegram bot is down), not
 *   "unread messages".
 * - Health/Library/Transport widgets intentionally left out — no
 *   bulk RPC exists yet (would be N+1 per-student/book calls).
 */

'use strict';

let _dashboardLoadedOnce = false;
let _dashboardScopeMine  = false; // false = whole school, true = my classes only
let _dashboardCache      = null;

function renderDashboard() {
  const container = document.getElementById('dashboardContent');
  if (!container) return Promise.resolve();

  // Language changes only need translated text. Once dashboard data is cached,
  // repaint from memory instead of refetching and briefly showing an intermediate
  // loading state — the latter was the source of the visible double-flash.
  if (_dashboardLoadedOnce && _dashboardCache) {
    _paintDashboard(container);
    return Promise.resolve();
  }

  if (!_dashboardLoadedOnce) {
    container.innerHTML = `<div class="skeleton-loading">${t('dash.loading')}</div>`;
  }
  return _loadDashboardData().then(() => {
    _dashboardLoadedOnce = true;
    _paintDashboard(container);
  }).catch(err => {
    container.innerHTML = emptyState('⚠️', t('dash.loadError'), err.message || String(err));
  });
}

/**
 * Refresh the Dashboard notification slices after a leave/message mutation.
 * The Dashboard intentionally caches its other widgets, so refreshing only
 * leave requests and parent communications avoids unnecessary network calls
 * and visible UI flashing while keeping the bell, cards, and sidebar badge current.
 */
window.refreshDashboardNotifications = async function() {
  try {
    const [leaveRequests, comms] = await Promise.all([
      API.getLeaveRequests().catch(() => []),
      API.getParentComms(30).catch(() => []),
    ]);
    const safeLeaveRequests = Array.isArray(leaveRequests) ? leaveRequests : [];
    const safeComms = Array.isArray(comms) ? comms : [];
    if (_dashboardCache) {
      _dashboardCache.leaveRequests = safeLeaveRequests;
      _dashboardCache.comms = safeComms;
    }
    _syncDashboardLeaveCount(safeLeaveRequests);

    const container = document.getElementById('dashboardContent');
    const dashboardPage = document.getElementById('page-dashboard');
    if (container && dashboardPage?.classList.contains('active') && _dashboardCache) {
      _paintDashboard(container);
    }
    return { leaveRequests: safeLeaveRequests, comms: safeComms };
  } catch (e) {
    console.warn('[dashboard] notification refresh failed:', e);
    return null;
  }
};

window.refreshDashboardLeaveRequests = window.refreshDashboardNotifications;

window.refreshDashboardIncidents = async function() {
  try {
    const incidents = await API.getIncidents(14);
    if (_dashboardCache) _dashboardCache.incidents = incidents || [];

    const container = document.getElementById('dashboardContent');
    const dashboardPage = document.getElementById('page-dashboard');
    if (container && dashboardPage?.classList.contains('active') && _dashboardCache) {
      _paintDashboard(container);
    }
    return incidents || [];
  } catch (e) {
    // The Incidents mutation already succeeded. Keep the existing dashboard
    // cache if a follow-up repaint fetch fails; the next dashboard visit can
    // refresh it normally.
    console.warn('[dashboard] incident refresh failed:', e);
    return null;
  }
}

function _syncDashboardLeaveCount(rows, repaintSidebar = true) {
  const list = Array.isArray(rows) ? rows : [];
  const pending = list.filter(r => r?.status === 'Pending').length;
  const changed = window.APP?.pendingLeaveCount !== pending;
  if (window.APP) window.APP.pendingLeaveCount = pending;
  if (repaintSidebar && changed && typeof renderSidebar === 'function') {
    renderSidebar();
  }
  return pending;
}

async function _loadDashboardData() {
  const [timetable, attendance, homework, incidents, comms, leaveRequests] = await Promise.all([
    API.getTimetable().catch(() => []),
    API.getAttendance(14).catch(() => []),
    API.getHomework(14).catch(() => []),
    API.getIncidents(14).catch(() => []),
    API.getParentComms(14).catch(() => []),
    API.getLeaveRequests().catch(() => []),
  ]);
  const safeLeaveRequests = Array.isArray(leaveRequests) ? leaveRequests : [];
  _dashboardCache = { timetable: timetable || [], attendance: attendance || [],
    homework: homework || [], incidents: incidents || [], comms: comms || [], leaveRequests: safeLeaveRequests };
  _syncDashboardLeaveCount(safeLeaveRequests);
}

function _dashboardScopedRows(rows) {
  if (!_dashboardScopeMine) return rows;
  const myId = window.APP?.teacher_id || '';
  return rows.filter(r => r.teacher_id === myId);
}

window.setDashboardScope = function(mine) {
  _dashboardScopeMine = mine;
  document.querySelectorAll('#dashboardScopeChips .chip').forEach(b =>
    b.classList.toggle('active', (b.dataset.scope === 'mine') === mine)
  );
  const container = document.getElementById('dashboardContent');
  if (container) _paintDashboard(container); // re-render from cache, no re-fetch
};

function _paintDashboard(container) {
  const d = _dashboardCache;
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayISO  = new Date().toISOString().slice(0, 10);

  const todaysClasses = _dashboardScopedRows(d.timetable)
    .filter(x => x.day === todayName)
    .sort((a, b) => (a.period ?? 0) - (b.period ?? 0));

  const classesToday = [...new Set(todaysClasses.map(x => x.class))];
  const markedToday  = new Set(d.attendance.filter(a => a.date === todayISO).map(a => a.class));
  const missingAttendance = classesToday.filter(c => !markedToday.has(c));

  const recentHomework = _dashboardScopedRows(d.homework)
    .filter(h => h.date === todayISO || h.date === _isoDaysAgo(1));

  const recentIncidents = _dashboardScopedRows(d.incidents).slice(0, 6);
  const queuedComms     = d.comms.filter(c => c.status === 'Queued');
  const leaveTotal       = d.leaveRequests.length;
  const leavePending     = d.leaveRequests.filter(r => r.status === 'Pending').length;

  const absenceCounts = {};
  for (const a of d.attendance) {
    if (a.status !== 'P') {
      absenceCounts[a.student_id] = absenceCounts[a.student_id] || { name: a.name_en, count: 0 };
      absenceCounts[a.student_id].count++;
    }
  }
  const attentionList = Object.entries(absenceCounts)
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  container.innerHTML = `
    <div class="chips-row" id="dashboardScopeChips">
      <button class="chip${!_dashboardScopeMine ? ' active' : ''}" data-scope="all" onclick="setDashboardScope(false)">${t('dash.wholeSchool')}</button>
      <button class="chip${_dashboardScopeMine ? ' active' : ''}" data-scope="mine" onclick="setDashboardScope(true)">${t('dash.myClassesOnly')}</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-num">${classesToday.length}</div>
        <div class="stat-lbl">${t('dash.classesToday')}</div>
      </div>
      <div class="stat-card${missingAttendance.length ? ' red' : ' green'}">
        <div class="stat-num">${missingAttendance.length}</div>
        <div class="stat-lbl">${t('dash.notYetMarked')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${recentHomework.length}</div>
        <div class="stat-lbl">${t('dash.homeworkLogged2d')}</div>
      </div>
      <div class="stat-card${recentIncidents.length ? ' red' : ''}">
        <div class="stat-num">${recentIncidents.length}</div>
        <div class="stat-lbl">${t('dash.recentIncidents')}</div>
      </div>
      <div class="stat-card${queuedComms.length ? ' red' : ''}">
        <div class="stat-num">${queuedComms.length}</div>
        <div class="stat-lbl">${t('dash.messagesQueued')}</div>
      </div>
      <div class="stat-card dashboard-leave-card${leavePending ? ' red' : ' muted'}" onclick="window.goToPage('leave')" role="button" tabindex="0">
        <div class="stat-num">${leavePending}/${leaveTotal}</div>
        <div class="stat-lbl">🔔 ${t('dash.leaveRequests')}</div>
      </div>
    </div>\n
       ${todaysClasses.length ? `
    <div class="more-section-title">${t('dash.todaysSchedule')}</div>
    ${todaysClasses.map(x => `
      <div class="list-card" data-class="${esc(x.class)}" onclick="_dashboardGoToAttendance(this.dataset.class)">
        <div class="card-row">
          <div class="card-avatar" style="background:${_classColor(x.class)}">${x.period ?? '·'}</div>
          <div class="card-info">
            <div class="card-name">${esc(x.class)} — ${esc(x.subject || '')}</div>
            <div class="card-sub">
              <span class="class-tag">${esc(x.start_time || '')}</span>
              ${x.room ? `<span>${esc(x.room)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>`).join('')}` : ''}

    <div class="more-section-title">${t('dash.quickActions')}</div>
    <div class="dashboard-actions">
      <button onclick="window.goToPage('attend')">${t('dash.takeAttendance')}</button>
      <button onclick="window.goToPage('hw')">${t('dash.logHomework')}</button>
      <button onclick="window.goToPage('parents')">${t('dash.messageParent')}</button>
      <button onclick="window.goToPage('incidents')">${t('dash.recordIncident')}</button>
    </div>

    ${attentionList.length ? `
    <div class="more-section-title">${t('dash.studentsAttention')}</div>
    ${attentionList.map(([, v]) => `
      <div class="list-card">
        <div class="card-row">
          <div class="card-avatar">${avatarContent({ name_en: v.name })}</div>
          <div class="card-info">
            <div class="card-name">${esc(v.name)}</div>
            <div class="card-sub"><span class="card-sub-pending">${t('dash.absences14', { n: v.count })}</span></div>
          </div>
        </div>
      </div>`).join('')}` : ''}

    ${recentIncidents.length ? `
    <div class="more-section-title">${t('dash.recentIncidentsTitle')}</div>
    ${recentIncidents.map(i => `
      <div class="list-card">
        <div class="card-row">
          <div class="card-avatar" style="background:${_classColor(i.class)}">${avatarContent({ name_en: i.name_en })}</div>
          <div class="card-info">
            <div class="card-name">${esc(i.name_en)} — ${esc(tv('incType', i.type))}</div>
            <div class="card-sub">${esc(i.date)}</div>
          </div>
        </div>
      </div>`).join('')}` : ''}
  `;
  _renderDashboardNotificationBell(leavePending, queuedComms.length);
  _dashboardWrapCardGroups(container);
}

// _classColor(cls) is reused as-is from js/04_students.js — same
// global scope, no re-declaration here (they're identical logic;
// duplicating it would just be two places to keep in sync).

function _dashboardGoToAttendance(className) {
  window.goToPage('attend');
  if (className && typeof window.selectAttendClass === 'function') {
    window.selectAttendClass(className);
    const sel = document.querySelector('.attend-class-select');
    if (sel) sel.value = className;
  }
}

function _isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}


function _dashboardWrapCardGroups(container) {
  const titles = Array.from(container.querySelectorAll('.more-section-title'));
  for (const title of titles) {
    const grid = document.createElement('div');
    grid.className = 'dashboard-list-grid';
    let node = title.nextElementSibling;
    while (node && !node.classList.contains('more-section-title')) {
      const next = node.nextElementSibling;
      if (node.classList.contains('list-card')) grid.appendChild(node);
      node = next;
    }
    if (grid.children.length) title.after(grid);
  }
}


function _renderDashboardNotificationBell(leavePending, queuedCount) {
  const el = document.getElementById('dashboardNotificationWrap');
  if (!el) return;
  const total = leavePending + queuedCount;
  el.innerHTML = `
    <button class="dashboard-notification-btn" type="button" aria-label="${t('dash.notifications')}" title="${t('dash.notifications')}"
      onclick="toggleDashboardNotifications(event)" aria-expanded="false" aria-controls="dashboardNotificationMenu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      ${total > 0 ? `<span class="dashboard-notification-badge">${total > 99 ? '99+' : total}</span>` : ''}
    </button>
    <div class="dashboard-notification-menu" id="dashboardNotificationMenu" hidden>
      <div class="dashboard-notification-head"><strong>${t('dash.notifications')}</strong><span>${t('dash.newCount', { n: total })}</span></div>
      ${leavePending ? `
        <button class="dashboard-notification-item" type="button" onclick="window.goToPage('leave'); closeDashboardNotifications()">
          <span class="dashboard-notification-item-icon">🔔</span>
          <span><strong>${t(leavePending === 1 ? 'dash.leavePendingOne' : 'dash.leavePendingMany', { n: leavePending })}</strong><small>${t('dash.leaveReview')}</small></span>
        </button>` : ''}
      ${queuedCount ? `
        <button class="dashboard-notification-item" type="button" onclick="window.goToPage('parents'); closeDashboardNotifications()">
          <span class="dashboard-notification-item-icon">⚠️</span>
          <span><strong>${t(queuedCount === 1 ? 'dash.messageNotDeliveredOne' : 'dash.messageNotDeliveredMany', { n: queuedCount })}</strong><small>${t('dash.bannerText')}</small></span>
        </button>` : ''}
      ${total === 0 ? `<div class="dashboard-notification-empty">${t('dash.noNewNotifications')}</div>` : ''}
    </div>`;
}
window.toggleDashboardNotifications = function(event) {
  event?.stopPropagation();
  const menu = document.getElementById('dashboardNotificationMenu');
  const btn = document.querySelector('.dashboard-notification-btn');
  if (!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  btn?.setAttribute('aria-expanded', String(open));
};
window.closeDashboardNotifications = function() {
  const menu = document.getElementById('dashboardNotificationMenu');
  const btn = document.querySelector('.dashboard-notification-btn');
  if (menu) menu.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
};

if (!window._dashboardNotificationEventsInstalled) {
  document.addEventListener('pointerdown', (event) => {
    const wrap = document.getElementById('dashboardNotificationWrap');
    if (!wrap?.contains(event.target)) window.closeDashboardNotifications();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    window.closeDashboardNotifications();
  });
  window._dashboardNotificationEventsInstalled = true;
}
