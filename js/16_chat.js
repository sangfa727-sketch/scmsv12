/**
 * SCMS v12 — Smart Staff Chat
 * UX layer: one compact communication center with a hard separation between
 * School Chat and AI Operations. The Admin Composer below is PREVIEW ONLY:
 * it never calls a send API.
 */
'use strict';

let _chatChannel = 'staff';
let _chatPollTimer = null;
let _directPollBusy = false;
let _chatScrollLock = false;
let _chatMode = 'school';
let _adminGradeRecipients = [];
let _adminTeacherRecipients = [];
let _directConversationId = null;
let _announcementId = null;
let _directPeer = null;
let _directStaff = [];
let _directConversations = [];

function _chatIcon(name) {
  const icons = {
    chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    send:'<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    bot:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 10h.01M16 10h.01M8 15c1.5 1 6.5 1 8 0M12 5V2M9 2h6"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 17h5"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  };
  return icons[name] || icons.chat;
}

function _verifiedStaffList() {
  const app = window.APP || {};
  const candidates = app.teacherDirectory || app.teachers || app.staff || [];
  if (!Array.isArray(candidates)) return [];
  const schoolId = app.school_id;
  return candidates.filter(t =>
    t && t.teacher_id && t.teacher_name &&
    (!schoolId || !t.school_id || t.school_id === schoolId) &&
    String(t.status || 'active').toLowerCase() === 'active'
  );
}

function _gradeRecipientPreview(grade) {
  // Server-authorized recipients are preferred. Bootstrap data is only a
  // temporary preview fallback; it must never be treated as authorization.
  if (String(grade).toLowerCase() === 'grade 5' && Array.isArray(_adminGradeRecipients)) {
    return _adminGradeRecipients;
  }
  if (Array.isArray(_adminGradeRecipients) && _adminGradeRecipients.length) return [];
  const staff = _verifiedStaffList();
  return staff.filter(t => {
    const classes = String(t.classes || '');
    const assigned = Array.isArray(t.classes) ? t.classes : classes.split(/[,|]/).map(x => x.trim()).filter(Boolean);
    return assigned.some(x => x.toLowerCase() === String(grade).toLowerCase());
  });
}

function _adminRecipientRows(type,target) {
  if (type === 'all_staff') return _verifiedStaffList();
  if (type === 'teacher') return _adminTeacherRecipients;
  return _adminGradeRecipients;
}

function _renderAdminComposer() {
  if (!window.APP?.is_admin) return '';
  const recipients = _adminGradeRecipients;
  return `
    <section class="smart-chat-admin-card" aria-label="Admin official message composer">
      <div class="smart-chat-section-head">
        <div>
          <div class="smart-chat-kicker">ADMIN TOOLS</div>
          <h2>Official message</h2>
          <p>Official messages require a reason and are routed only to server-verified active staff.</p>
        </div>
        <span class="smart-chat-preview-badge">SERVER VERIFIED</span>
      </div>

      <div class="smart-chat-form-grid">
        <label>Recipient type
          <select id="adminMsgRecipientType" onchange="_loadAdminRecipientPreview()">
            <option value="all_staff">All Staff</option>
            <option value="grade" selected>Grade</option>
            <option value="teacher">Individual teacher</option>
          </select>
        </label>
        <label id="adminMsgGradeWrap">Grade
          <select id="adminMsgGrade" onchange="_loadAdminRecipientPreview('grade',this.value)">
            <option value="" selected>Loading available grades…</option>
          </select>
        </label>
        <label id="adminMsgTeacherWrap" style="display:none">Teacher
          <select id="adminMsgTeacher" onchange="_refreshAdminComposerPreview()">
            <option value="">Select a teacher</option>
          </select>
        </label>
        <label>Message type
          <select id="adminMsgType" onchange="_refreshAdminComposerPreview()">
            <option value="announcement" selected>Announcement</option>
            <option value="task">Official task</option>
            <option value="notice">Staff notice</option>
          </select>
        </label>
        <label>Reason
          <input id="adminMsgReason" value="Official school communication"
                 oninput="_refreshAdminComposerPreview()">
        </label>
      </div>

      <label class="smart-chat-body-field">Body
        <textarea id="adminMsgBody" rows="3" placeholder="Write the official message..." oninput="_refreshAdminComposerPreview()"></textarea>
      </label>

      <div class="smart-chat-routing-status blocked" id="adminMsgRoutingStatus">
        <span class="smart-chat-status-dot"></span>
        <div><strong id="adminMsgRoutingTitle">Checking verified recipients…</strong><small id="adminMsgRoutingNames"></small></div>
      </div>

      <div class="smart-chat-official-preview" id="adminMsgPreview"></div>

      <div class="smart-chat-form-actions">
        <button type="button" class="btn-secondary" onclick="_loadAdminRecipientPreview()">Refresh recipients</button>
        <button type="button" class="smart-chat-send-disabled" id="adminMsgSendBtn" onclick="sendOfficialAnnouncement()" disabled>
          ${_chatIcon('send')} Send official message
        </button>
      </div>
    </section>`;
}

async function _loadAdminRecipientPreview(type = null, target = null) {
  try {
    if (!window.API?.getChatRecipientPreview || !window.APP?.is_admin) return;
    const selectedType = type || document.getElementById('adminMsgRecipientType')?.value || 'grade';
    if (selectedType === 'grade' && window.API?.getChatGradeTargets) {
      try {
        const grades = await API.getChatGradeTargets();
        const select = document.getElementById('adminMsgGrade');
        if (select && grades.length) {
          const current = target || select.value || grades[0];
          select.innerHTML = grades.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
          select.value = grades.includes(current) ? current : grades[0];
        }
      } catch (_) {}
    }
    const grade = target || document.getElementById('adminMsgGrade')?.value || null;
    const rows = await API.getChatRecipientPreview(selectedType, selectedType === 'all_staff' ? null : (selectedType === 'teacher' ? (document.getElementById('adminMsgTeacher')?.value || null) : grade));
    if (selectedType === 'teacher') {
      _adminTeacherRecipients = Array.isArray(rows) ? rows : [];
      const select = document.getElementById('adminMsgTeacher');
      if (select) {
        const current = select.value;
        select.innerHTML = '<option value="">Select a teacher</option>' +
          _adminTeacherRecipients.map(t => `<option value="${esc(t.teacher_id)}">${esc(t.teacher_name)} · ${esc(t.role || 'Teacher')}</option>`).join('');
        if (_adminTeacherRecipients.some(t => t.teacher_id === current)) select.value = current;
      }
    } else if (selectedType === 'grade') {
      _adminGradeRecipients = Array.isArray(rows) ? rows : [];
    } else {
      _adminGradeRecipients = Array.isArray(rows) ? rows : [];
    }
    _refreshAdminComposerPreview();
  } catch (e) {
    if ((type || document.getElementById('adminMsgRecipientType')?.value) === 'teacher') _adminTeacherRecipients = [];
    else _adminGradeRecipients = [];
    _refreshAdminComposerPreview();
  }
}

window.sendOfficialAnnouncement = async function() {
  if (!window.APP?.is_admin || !window.API?.createStaffAnnouncement) return false;
  const recipientType = document.getElementById('adminMsgRecipientType')?.value || 'grade';
  const grade = document.getElementById('adminMsgGrade')?.value || null;
  const teacherId = document.getElementById('adminMsgTeacher')?.value || null;
  const target = recipientType === 'all_staff' ? null : (recipientType === 'teacher' ? teacherId : grade);
  const messageType = document.getElementById('adminMsgType')?.value || 'announcement';
  const reason = document.getElementById('adminMsgReason')?.value.trim() || '';
  const body = document.getElementById('adminMsgBody')?.value.trim() || '';
  const btn = document.getElementById('adminMsgSendBtn');
  const recipients = _adminRecipientRows(recipientType, target);
  if (!recipients.length || (recipientType === 'teacher' && !teacherId)) {
    showToast('No verified recipient. Message was not sent.');
    return false;
  }
  if (!reason || !body) {
    showToast('Reason and message body are required.');
    return false;
  }
  if (btn) btn.disabled = true;
  try {
    const result = await API.createStaffAnnouncement(recipientType, target, messageType, reason, body);
    if (!result?.ok) throw new Error(result?.error || 'Send failed');
    if (btn) btn.innerHTML = '✓ Sent';
    showToast('Official message sent to ' + result.recipient_count + ' verified staff.');
    document.getElementById('adminMsgBody').value = '';
    setTimeout(() => {
      if (btn) { btn.innerHTML = _chatIcon('send') + ' Send official message'; btn.disabled = false; }
      _refreshAdminComposerPreview();
    }, 900);
  } catch (e) {
    showToast('Official message could not be sent.');
    if (btn) btn.disabled = false;
  }
  return false;
};

window._refreshAdminComposerPreview = function() {
  const box = document.getElementById('adminMsgPreview');
  if (!box) return;
  const recipientType = document.getElementById('adminMsgRecipientType')?.value || 'grade';
  const grade = document.getElementById('adminMsgGrade')?.value || 'Grade 5';
  const teacherId = document.getElementById('adminMsgTeacher')?.value || '';
  const type = document.getElementById('adminMsgType')?.value || 'announcement';
  const reason = document.getElementById('adminMsgReason')?.value.trim() || '—';
  const body = document.getElementById('adminMsgBody')?.value.trim() || '—';
  const recipients = recipientType === 'all_staff' ? _verifiedStaffList() : _adminRecipientRows(recipientType, recipientType === 'teacher' ? teacherId : grade);
  const selectedTeacher = recipientType === 'teacher' ? _adminTeacherRecipients.find(t => t.teacher_id === teacherId) : null;
  const gradeWrap = document.getElementById('adminMsgGradeWrap');
  const teacherWrap = document.getElementById('adminMsgTeacherWrap');
  if (gradeWrap) gradeWrap.style.display = recipientType === 'grade' ? '' : 'none';
  if (teacherWrap) teacherWrap.style.display = recipientType === 'teacher' ? '' : 'none';
  const validRecipient = recipientType === 'teacher' ? !!selectedTeacher : recipients.length > 0;
  const status = document.getElementById('adminMsgRoutingStatus');
  const title = document.getElementById('adminMsgRoutingTitle');
  const names = document.getElementById('adminMsgRoutingNames');
  if (status) status.className = 'smart-chat-routing-status ' + (validRecipient ? 'verified' : 'blocked');
  if (title) title.textContent = validRecipient ? (recipientType === 'teacher' ? '1 verified recipient' : recipients.length + ' verified recipient(s)') : 'No verified recipient';
  if (names) names.textContent = validRecipient ? (recipientType === 'teacher' ? selectedTeacher.teacher_name : recipients.map(t => t.teacher_name).join(', ')) : 'Server authorization did not return an active same-school recipient.';
  const sendBtn = document.getElementById('adminMsgSendBtn');
  if (sendBtn) sendBtn.disabled = !window.APP?.is_admin || !reason || reason === '—' || !body || body === '—' || !validRecipient;
  const header = type === 'announcement' ? 'Official Announcements Channel' : type === 'task' ? 'Official Staff Task' : 'Staff Notice';
  const targetLabel = recipientType === 'all_staff' ? 'All Staff' : recipientType === 'grade' ? 'Grade: ' + grade : 'Individual: ' + (selectedTeacher?.teacher_name || 'Select teacher');
  box.innerHTML = `
    <div class="smart-chat-preview-label">SYSTEM-GENERATED HEADER</div>
    <div class="smart-chat-preview-header">${esc(header)}</div>
    <div class="smart-chat-preview-meta">${esc(targetLabel)} · Verified recipients: ${validRecipient ? (recipientType === 'teacher' ? 1 : recipients.length) : 0}</div>
    <div class="smart-chat-preview-reason"><strong>Reason</strong><span>${esc(reason)}</span></div>
    <div class="smart-chat-preview-body">${esc(body).replace(/\\n/g, '<br>')}</div>
  `;
};


(function _installSmartChatUxPatch(){
  if (document.getElementById('smart-chat-ux-patch')) return;
  const s=document.createElement('style');
  s.id='smart-chat-ux-patch';
  s.textContent=`
    .smart-chat-hero{position:relative}\n    /* Chat workspace: temporarily replaces the global SCMS chrome while active. */\n    html.scms-chat-workspace #appHeader,\n    html.scms-chat-workspace #sidebar,\n    html.scms-chat-workspace #sidebarBackdrop,\n    html.scms-chat-workspace #tabBar,\n    html.scms-chat-workspace #fab{display:none !important}\n    html.scms-chat-workspace #pages{padding-top:0 !important}\n    html.scms-chat-workspace #page-chat{height:100dvh !important;min-height:100dvh !important;margin:0 !important;padding:0 !important}\n    html.scms-chat-workspace #page-chat .smart-chat-shell{min-height:100dvh;box-sizing:border-box}\n    .smart-chat-channel-back-row{display:flex;align-items:center;margin:0 0 8px}\n    .smart-chat-channel-back{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 10px;border:1px solid var(--border);border-radius:9px;background:var(--bg2);color:var(--text2);font-size:11px;font-weight:700;cursor:pointer}\n    .smart-chat-channel-back:hover{background:var(--surface2);color:var(--text)}
    .smart-chat-nav-back{
      display:inline-flex;align-items:center;justify-content:center;gap:6px;
      min-height:34px;padding:0 10px;border:1px solid var(--border);
      border-radius:9px;background:var(--bg2);color:var(--text2);
      font-size:11px;font-weight:700;flex:0 0 auto;
    }
    .smart-chat-nav-back:hover{background:var(--surface2);color:var(--text)}
    .smart-chat-nav-back span{font-size:11px}
    @media(max-width:760px){
      .smart-chat-shell{padding:10px 8px calc(var(--tab-h,56px) + 20px)}
      .smart-chat-hero{gap:8px;align-items:flex-start}
      .smart-chat-hero>div:first-of-type{min-width:0;flex:1}
      .smart-chat-hero .page-title{font-size:21px}
      .smart-chat-hero .page-subtitle{font-size:11px;line-height:1.4}
      .smart-chat-nav-back{order:-1;min-width:62px;height:34px}
      .smart-chat-mode-switch{position:sticky;top:0;z-index:5}
      .smart-chat-channel-list{scroll-snap-type:x proximity;overscroll-behavior-x:contain}
      .smart-chat-channel-card{min-width:138px;scroll-snap-align:start}
      .smart-chat-conversation{min-height:calc(100dvh - 210px)}
      .smart-chat-conversation .chat-stream{max-height:none;min-height:0;flex:1}
      .chat-composer{padding-bottom:max(8px,env(safe-area-inset-bottom))}
      .smart-chat-direct-shell{position:relative;display:block;min-height:calc(100dvh - 205px)}
      .smart-chat-direct-list{min-height:0;max-height:none;height:calc(100dvh - 205px);overflow:hidden}
      .smart-chat-direct-conversation{display:none;min-height:calc(100dvh - 205px);height:calc(100dvh - 205px)}
      .smart-chat-direct-shell.has-selection .smart-chat-direct-list{display:none}
      .smart-chat-direct-shell.has-selection .smart-chat-direct-conversation{display:flex}
      .smart-chat-direct-conversation .chat-stream{max-height:none;min-height:0;flex:1;overflow-y:auto}
      .smart-chat-direct-composer{position:sticky;bottom:0}
      .smart-chat-mobile-back{width:34px;height:34px;flex:0 0 34px}
      .smart-chat-direct-peer{gap:7px}
      .smart-chat-direct-peer>div:last-child{max-width:calc(100vw - 150px)}
      .smart-chat-conversation-head{padding:9px 10px}
      .smart-chat-verified-pill{font-size:9px}
      .smart-chat-ai-card,.smart-chat-admin-card{border-radius:12px}
      .smart-chat-ai-composer{position:sticky;bottom:0}
    }
    @media(max-width:380px){
      .smart-chat-nav-back span{display:none}
      .smart-chat-nav-back{min-width:36px;padding:0 8px}
      .smart-chat-hero .page-title{font-size:20px}
      .smart-chat-channel-card{min-width:128px}
    }
  `;
  document.head.appendChild(s);
})();

function _enterChatWorkspace() {
  const root = document.documentElement;
  if (root) root.classList.add('scms-chat-workspace');
}

function _exitChatWorkspace() {
  const root = document.documentElement;
  if (root) root.classList.remove('scms-chat-workspace');
}

function renderChat() {
  const page = document.getElementById('page-chat');
  if (!page) return;
  _enterChatWorkspace();

  page.innerHTML = `
    <div class="smart-chat-shell">
      <div class="smart-chat-hero">
        <button type="button" class="smart-chat-nav-back" onclick="_chatBackToMenu()" aria-label="Exit Chat">‹ <span>Exit Chat</span></button>
        <div>
          <div class="page-eyebrow">COMMUNICATION CENTER</div>
          <h1 class="page-title">Smart <em>Chat</em></h1>
          <p class="page-subtitle">School communication and AI operations — kept separate, one tap away.</p>
        </div>
        <div class="smart-chat-identity">
          <span class="smart-chat-avatar">${esc((window.APP?.teacher_name || '?')[0])}</span>
          <span>${esc(window.APP?.teacher_name || 'Staff')}</span>
        </div>
      </div>

      <div class="smart-chat-mode-switch" role="tablist">
        <button class="${_chatMode === 'school' ? 'active' : ''}" onclick="switchChatMode('school')" role="tab">
          ${_chatIcon('users')} School Chat
        </button>
        <button class="${_chatMode === 'ai' ? 'active' : ''}" onclick="switchChatMode('ai')" role="tab">
          ${_chatIcon('bot')} AI Assistant
        </button>
      </div>

      <div id="smartChatModeBody"></div>
    </div>`;

  _renderChatMode();
}

window._chatBackToMenu = function() {
  _exitChatWorkspace();
  try {
    if (typeof closeSidebar === 'function') closeSidebar();
    if (typeof isTWA === 'function' && !isTWA() && typeof openSidebar === 'function') {
      openSidebar();
      return;
    }
    if (typeof goToPage === 'function') {
      goToPage('dashboard');
      return;
    }
    if (window.APP) window.APP.currentPage = 'dashboard';
  } catch (e) {
    console.warn('[chat] menu navigation failed', e);
  }
};

window.switchChatMode = function(mode) {
  _chatMode = mode === 'ai' ? 'ai' : 'school';
  document.querySelectorAll('.smart-chat-mode-switch button').forEach((b, i) =>
    b.classList.toggle('active', (_chatMode === 'school' && i === 0) || (_chatMode === 'ai' && i === 1))
  );
  _renderChatMode();
};

function _renderChatMode() {
  const root = document.getElementById('smartChatModeBody');
  if (!root) return;
  if (_chatMode === 'ai') {
    root.innerHTML = `
      <section class="smart-chat-ai-card">
        <div class="smart-chat-ai-head">
          <div class="smart-chat-ai-icon">${_chatIcon('bot')}</div>
          <div><strong>SCMS AI Assistant</strong><span>School operations · schedule · planning</span></div>
        </div>
        <div class="smart-chat-quick-grid">
          <button onclick="_aiPrompt('Today schedule')">${_chatIcon('calendar')}<span>Today’s schedule</span></button>
          <button onclick="_aiPrompt('Schedule a task')">${_chatIcon('calendar')}<span>Schedule a task</span></button>
          <button onclick="_aiPrompt('Check timetable')">${_chatIcon('calendar')}<span>Check timetable</span></button>
          <button onclick="_aiPrompt('Plan tomorrow')">${_chatIcon('calendar')}<span>Plan tomorrow</span></button>
        </div>
        <div class="smart-chat-schedule-card">
          <div><span class="smart-chat-kicker">SCHEDULE</span><strong>AI can prepare, check and organize school tasks.</strong></div>
          <span class="smart-chat-schedule-chip">Preview flow</span>
        </div>
        <div class="smart-chat-ai-note"><strong>UI shell only</strong><br>AI Universe Layer execution is intentionally not connected yet. When it is ready, this same interface will connect to the authorized AI action flow.</div>
        <div class="smart-chat-ai-composer">
          <input id="aiChatInput" placeholder="Ask about schedule, students, attendance..." onkeydown="if(event.key==='Enter')_aiPrompt(this.value)">
          <button onclick="_aiPrompt(document.getElementById('aiChatInput')?.value)">${_chatIcon('send')}</button>
        </div>
      </section>`;
    return;
  }

  const channels = [
    { id:'staff', name:'All Staff', icon:'👥', sub:'General staff conversation' },
    { id:'announcements', name:'Official Announcements', icon:'📢', sub:'System-generated official notices' },
    { id:'departments', name:'Department & Grade', icon:'📚', sub:'Class / department channels' },
    { id:'tickets', name:'Inquiry Tickets', icon:'🎫', sub:'Student / parent conversations' },
    { id:'direct', name:'1-on-1 Direct Messages', icon:'👤', sub:'Private staff-to-staff chat' },
    { id:'events', name:'Project / Event Groups', icon:'🗂️', sub:'Temporary work groups' }
  ];
  const visible = channels;
  if (!visible.some(c => c.id === _chatChannel)) _chatChannel = 'staff';

  if (_chatChannel === 'direct') {
    root.innerHTML = _renderDirectWorkspace();
    _loadDirectWorkspace();
    return;
  }

  if (_chatChannel === 'announcements') {
    root.innerHTML = _renderAnnouncementWorkspace();
    _loadAnnouncementWorkspace();
    if (window.APP?.is_admin) setTimeout(() => _loadAdminRecipientPreview(), 0);
    return;
  }

  if (_chatChannel === 'departments' && typeof _renderDepartmentWorkspace === 'function') { root.innerHTML = _renderDepartmentWorkspace(); _loadDepartmentWorkspace(); return; }

  if (_chatChannel === 'tickets') {
    root.innerHTML = _renderInquiryWorkspace();
    _loadInquiryTickets();
    return;
  }

  if (_chatChannel === 'events' && typeof _renderGroupWorkspace === 'function') {
    _renderGroupWorkspace();
    return;
  }

  root.innerHTML = `
    <div class="smart-chat-school-grid">
      <aside class="smart-chat-channel-list">
        <div class="smart-chat-list-title">School Chat</div>
        ${visible.map(c => `
          <button data-testid="chat-channel-${c.id}" class="smart-chat-channel-card ${c.id === _chatChannel ? 'active' : ''}" onclick="switchChatChannel('${esc(c.id)}')">
            <span class="smart-chat-channel-icon">${c.icon}</span>
            <span><strong>${esc(c.name)}</strong><small>${esc(c.sub)}</small></span>
            <b>›</b>
          </button>`).join('')}
      </aside>
      <section class="smart-chat-conversation">
        <div class="smart-chat-conversation-head">
          <div><strong>${esc(channels.find(c=>c.id===_chatChannel)?.name || 'School Chat')}</strong><small>${esc(channels.find(c=>c.id===_chatChannel)?.sub || '')}</small></div>
          <span class="smart-chat-verified-pill">Verified staff only</span>
        </div>
        <div class="chat-stream" id="chatStream">${skeletonCards(2)}</div>
        <form class="chat-composer" id="chatComposer" onsubmit="return sendChat(event)">
          <textarea id="chatInput" placeholder="${_chatChannel === 'staff' ? esc(t('chat.ph')) : 'Channel backend is not connected yet'}" rows="1" ${_chatChannel === 'staff' ? '' : 'disabled'} oninput="_autoGrowChatInput(this)" onkeydown="_chatKeydown(event)"></textarea>
          <button type="submit" class="chat-send-btn" id="chatSendBtn" ${_chatChannel === 'staff' ? '' : 'disabled'}>${_chatChannel === 'staff' ? _chatIcon('send') : 'Preview'}</button>
        </form>
      </section>
    </div>
    ${_renderAdminComposer()}`;
  _loadChatMessages();
  setTimeout(() => {
    _refreshAdminComposerPreview();
    if (window.APP?.is_admin) _loadAdminRecipientPreview();
  }, 0);
}


function _renderInquiryWorkspace() {
  return _chatChannelBack('School Chat') + `
    <div class="smart-chat-direct-shell smart-chat-inquiry-shell${_inquiryTicketId ? " has-selection" : ""}">
      <aside class="smart-chat-direct-list">
        <div class="smart-chat-direct-list-head"><div><div class="smart-chat-kicker">INQUIRY</div><strong>Inquiry Tickets</strong></div><button type="button" onclick="_loadInquiryTickets()" title="Refresh">↻</button></div>
        <div class="smart-chat-directory-title">Staff-only student / parent issue tracking</div>
        <div id="inquiryTicketList" class="smart-chat-conversation-list"></div>
        <button type="button" class="btn-secondary" onclick="_newInquiryTicket()">＋ New ticket</button>
      </aside>
      <section class="smart-chat-direct-conversation">
        <div id="inquiryTicketHead" class="smart-chat-conversation-head"><div><strong>Select a ticket</strong><small>Only authorized staff in this school can access ticket messages.</small></div><span class="smart-chat-verified-pill">School isolated</span></div>
        <div id="inquiryMessageStream" class="chat-stream smart-chat-direct-stream"><div class="chat-empty"><div class="chat-empty-icon">🎫</div><div class="chat-empty-title">Inquiry Tickets</div><div class="chat-empty-sub">Create or select a staff ticket.</div></div></div>
        <form class="chat-composer smart-chat-direct-composer" onsubmit="return _sendInquiryFromComposer(event)">
          <textarea id="inquiryChatInput" placeholder="Select a ticket..." rows="1" disabled></textarea>
          <button type="submit" class="chat-send-btn" id="inquirySendBtn" disabled>${_chatIcon('send')}</button>
        </form>
      </section>
    </div>`;
}

let _inquiryTickets=[], _inquiryTicketId=null, _inquiryCurrentTicket=null, _inquiryDraft=null;
function _renderInquiryTicketList(){
  const box=document.getElementById('inquiryTicketList'); if(!box)return;
  box.innerHTML=_inquiryTickets.length?_inquiryTickets.map(t=>`<button class="smart-chat-channel-card ${Number(t.id)===Number(_inquiryTicketId)?'active':''}" onclick="_openInquiryTicket(${Number(t.id)})"><span class="smart-chat-channel-icon">🎫</span><span><strong>${esc(t.subject)}</strong><small>${esc(t.status)} · ${esc(t.priority)}</small></span>${Number(t.unread_count)>0?`<b class="smart-chat-unread" title="Unread messages">${esc(t.unread_count)}</b>`:'<b>›</b>'}</button>`).join(''):'<div class="chat-empty-sub">No tickets yet.</div>';
}
async function _loadInquiryTickets(){
  try{
    _inquiryTickets=await API.getInquiryTickets();
    _renderInquiryTicketList();
    if(_inquiryTicketId) await _openInquiryTicket(_inquiryTicketId);
  }catch(e){const box=document.getElementById('inquiryTicketList');if(box)box.innerHTML='<div class="chat-error">Unable to load tickets.</div>';}
}
async function _openInquiryTicket(id){
  _inquiryTicketId=Number(id); const shell=document.querySelector('.smart-chat-inquiry-shell');if(shell)shell.classList.add('has-selection'); const r=await API.openInquiryTicket(_inquiryTicketId); if(!r?.ok)return;
  const h=document.getElementById('inquiryTicketHead'), s=document.getElementById('inquiryMessageStream'), input=document.getElementById('inquiryChatInput'), btn=document.getElementById('inquirySendBtn');
  _inquiryCurrentTicket=r.ticket;
  const adminControls=window.APP?.is_admin?'<div class="smart-chat-inquiry-admin"><label>Status <select id="inquiryStatusSelect" onchange="_updateInquiryTicket()"><option>OPEN</option><option>ASSIGNED</option><option>IN_PROGRESS</option><option>WAITING</option><option>RESOLVED</option><option>CLOSED</option></select></label><label>Assignee <select id="inquiryAssigneeSelect" onchange="_updateInquiryTicket()"><option value="">Unassigned</option></select></label></div>':'';
  if(h)h.innerHTML=`<div class="smart-chat-direct-peer"><button type="button" class="smart-chat-mobile-back" onclick="_clearInquirySelection()" aria-label="Back to inquiry tickets">‹</button><div><strong>${esc(r.ticket.subject)}</strong><small>${esc(r.ticket.status)} · ${esc(r.ticket.priority)}${r.ticket.student_id?' · Student '+esc(r.ticket.student_id):''}</small></div><span class="smart-chat-verified-pill">Authorized</span>${adminControls}`;
  if(window.APP?.is_admin){
    const ss=document.getElementById('inquiryStatusSelect'), aa=document.getElementById('inquiryAssigneeSelect');
    if(ss)ss.value=r.ticket.status;
    if(aa){
      const staff=_verifiedStaffList();
      aa.innerHTML='<option value="">Unassigned</option>'+staff.map(t=>`<option value="${esc(t.teacher_id)}">${esc(t.teacher_name||t.name||t.teacher_id)}</option>`).join('');
      if(r.ticket.assigned_teacher_id)aa.value=r.ticket.assigned_teacher_id;
    }
  }
  if(s)s.innerHTML=(r.messages||[]).map(m=>`<div class="chat-bubble-row"><div class="chat-bubble"><strong>${esc(m.sender_teacher_name)}</strong><div>${esc(m.body).replace(/\n/g,'<br>')}</div><small>${esc(m.created_at||'')}</small></div></div>`).join('')||'<div class="chat-empty-sub">No messages.</div>';
  if(input){input.disabled=r.ticket.status==='CLOSED';input.placeholder=input.disabled?'Ticket closed':'Write a reply...';}
  if(btn)btn.disabled=input?.disabled||!_inquiryTicketId;
  if(window.API?.markInquiryRead){
    try{
      await API.markInquiryRead(_inquiryTicketId);
      const item=_inquiryTickets.find(t=>Number(t.id)===Number(_inquiryTicketId));
      if(item) item.unread_count=0;
      _renderInquiryTicketList();
    }catch(e){ /* read state is best-effort; authorization remains server-side */ }
  }
}
window._clearInquirySelection=function(){_inquiryTicketId=null;_inquiryCurrentTicket=null;const shell=document.querySelector('.smart-chat-inquiry-shell');if(shell)shell.classList.remove('has-selection');const h=document.getElementById('inquiryTicketHead');if(h)h.innerHTML='<div><strong>Select a ticket</strong><small>Only authorized staff in this school can access ticket messages.</small></div><span class="smart-chat-verified-pill">School isolated</span>';const s=document.getElementById('inquiryMessageStream');if(s)s.innerHTML='<div class="chat-empty"><div class="chat-empty-icon">🎫</div><div class="chat-empty-title">Select a ticket</div><div class="chat-empty-sub">Create or select a staff ticket.</div></div>';const i=document.getElementById('inquiryChatInput');if(i){i.disabled=true;i.placeholder='Select a ticket...';}const b=document.getElementById('inquirySendBtn');if(b)b.disabled=true;_renderInquiryTicketList();};

async function _updateInquiryTicket(){
  if(!window.APP?.is_admin||!_inquiryTicketId)return;
  const status=document.getElementById('inquiryStatusSelect')?.value||null;
  const assignee=document.getElementById('inquiryAssigneeSelect')?.value||null;
  const r=await API.updateInquiryTicket(_inquiryTicketId,status,assignee||null);
  if(r?.ok){await _loadInquiryTickets();await _openInquiryTicket(_inquiryTicketId);}else showToast('Ticket update could not be applied.');
}
async function _sendInquiryFromComposer(e){
  e?.preventDefault(); const input=document.getElementById('inquiryChatInput'); if(!_inquiryTicketId||!input?.value.trim())return false;
  const r=await API.sendInquiryMessage(_inquiryTicketId,input.value.trim()); if(r?.ok){input.value='';await _openInquiryTicket(_inquiryTicketId);await _loadInquiryTickets();} else showToast('Message could not be sent.'); return false;
}
function _closeInquiryDraft(){_inquiryDraft=null;_renderInquiryDraft();}
function _renderInquiryDraft(){
  const root=document.getElementById('inquiryTicketList'); if(!root)return;
  if(!_inquiryDraft){root.innerHTML=_inquiryTickets.length?_inquiryTickets.map(t=>`<button class="smart-chat-channel-card ${Number(t.id)===Number(_inquiryTicketId)?'active':''}" onclick="_openInquiryTicket(${Number(t.id)})"><span class="smart-chat-channel-icon">🎫</span><span><strong>${esc(t.subject)}</strong><small>${esc(t.status)} · ${esc(t.priority)}${t.student_id?' · '+esc(t.student_id):''}</small></span><b>›</b></button>`).join(''):'<div class="chat-empty-sub">No tickets yet.</div>';return;}
  root.innerHTML=`
    <form class="smart-chat-inquiry-form" onsubmit="return _submitInquiryDraft(event)">
      <label>Subject<input id="inquiryDraftSubject" maxlength="160" required placeholder="What needs attention?"></label>
      <label>Priority<select id="inquiryDraftPriority"><option>NORMAL</option><option>LOW</option><option>HIGH</option><option>URGENT</option></select></label>
      <label>Student ID <span class="smart-chat-field-note">optional · same school only</span><input id="inquiryDraftStudent" maxlength="80" placeholder="Student ID"></label>
      <label>Details<textarea id="inquiryDraftBody" maxlength="4000" rows="5" required placeholder="Describe the issue clearly..."></textarea></label>
      <div class="smart-chat-inquiry-form-actions"><button type="button" class="btn-secondary" onclick="_closeInquiryDraft()">Cancel</button><button type="submit" class="btn-primary">Create ticket</button></div>
    </form>`;
}
async function _newInquiryTicket(){_inquiryDraft=true;_renderInquiryDraft();}
async function _submitInquiryDraft(e){
  e?.preventDefault();
  const subject=document.getElementById('inquiryDraftSubject')?.value.trim();
  const body=document.getElementById('inquiryDraftBody')?.value.trim();
  const priority=document.getElementById('inquiryDraftPriority')?.value||'NORMAL';
  const studentId=document.getElementById('inquiryDraftStudent')?.value.trim()||null;
  if(!subject||!body)return false;
  const r=await API.createInquiryTicket(subject,body,studentId,priority);
  if(r?.ok){_inquiryDraft=null;_inquiryTicketId=Number(r.ticket.id);await _loadInquiryTickets();}
  else showToast('Ticket could not be created.');
  return false;
}
function _renderAnnouncementWorkspace(){
  return _chatChannelBack('School Chat') +
    '<div class="smart-chat-direct-shell smart-chat-announcement-shell'+(_announcementId?' has-selection':'')+'">'+
    '<aside class="smart-chat-direct-list"><div class="smart-chat-direct-list-head"><div><div class="smart-chat-kicker">OFFICIAL</div><strong>Announcements</strong></div><button type="button" onclick="_loadAnnouncementWorkspace()" title="Refresh">↻</button></div><div id="announcementList" class="smart-chat-conversation-list"></div></aside>'+
    '<section class="smart-chat-direct-conversation"><div id="announcementHead" class="smart-chat-conversation-head"><div><strong>Official Announcements</strong><small>School-authorized notices for your staff account.</small></div><span class="smart-chat-verified-pill">Verified</span></div><div id="announcementStream" class="chat-stream"><div class="chat-empty"><div class="chat-empty-icon">📢</div><div class="chat-empty-title">Official Announcements</div><div class="chat-empty-sub">Loading…</div></div></div></section></div>' +
    (window.APP?.is_admin ? _renderAdminComposer() : '');
}
async function _loadAnnouncementWorkspace(autoOpen=true){
  try{
    const rows=await API.getStaffAnnouncements(50);
    const list=document.getElementById('announcementList'),stream=document.getElementById('announcementStream');
    if(!list||!stream)return;
    window._chatAnnouncements=rows;
    if(!rows.length){_announcementId=null;list.innerHTML='<div class="chat-empty-sub">No official announcements yet.</div>';stream.innerHTML='<div class="chat-empty"><div class="chat-empty-icon">📢</div><div class="chat-empty-title">No announcements</div><div class="chat-empty-sub">Official school notices will appear here.</div></div>';return;}
    list.innerHTML=rows.map(a=>'<button class="smart-chat-channel-card '+(Number(a.id)===Number(_announcementId)?'active':'')+'" onclick="_openAnnouncement('+Number(a.id)+')"><span class="smart-chat-channel-icon">📢</span><span><strong>'+esc(a.message_type||'Official notice')+'</strong><small>'+esc(a.created_at||'')+'</small></span><b>'+(!a.read_at?'•':'›')+'</b></button>').join('');
    if(autoOpen && !_announcementId) await _openAnnouncement(Number(rows[0].id));
  }catch(e){const list=document.getElementById('announcementList');if(list)list.innerHTML='<div class="chat-error">Unable to load announcements.</div>';}
}
window._openAnnouncement=async function(id){
  const a=(window._chatAnnouncements||[]).find(x=>Number(x.id)===Number(id));
  const stream=document.getElementById('announcementStream');if(!a||!stream)return;
  _announcementId=Number(id);
  const shell=document.querySelector('.smart-chat-announcement-shell');if(shell)shell.classList.add('has-selection');
  const head=document.getElementById('announcementHead');
  if(head)head.innerHTML='<div class="smart-chat-direct-peer"><button type="button" class="smart-chat-mobile-back" onclick="_clearAnnouncementSelection()" aria-label="Back to announcements">‹</button><div><strong>Official '+esc(a.message_type||'Announcement')+'</strong><small>'+esc(a.created_at||'')+'</small></div></div><span class="smart-chat-verified-pill">Verified</span>';
  stream.innerHTML='<article class="smart-chat-official-preview"><div class="smart-chat-preview-label">SYSTEM-GENERATED OFFICIAL MESSAGE</div><div class="smart-chat-preview-header">'+esc(a.message_type||'Official Announcement')+'</div><div class="smart-chat-preview-meta">'+esc(a.created_at||'')+' · '+(!a.read_at?'Unread':'Read')+'</div><div class="smart-chat-preview-reason"><strong>Reason</strong><span>'+esc(a.reason||'Official school communication')+'</span></div><div class="smart-chat-preview-body">'+esc(a.body||'').replace(/\n/g,'<br>')+'</div></article>';
  try{if(API.markStaffAnnouncementRead)await API.markStaffAnnouncementRead(id);a.read_at=a.read_at||new Date().toISOString();}catch(e){}
};
window._clearAnnouncementSelection=function(){
  _announcementId=null;
  const shell=document.querySelector('.smart-chat-announcement-shell');if(shell)shell.classList.remove('has-selection');
  const head=document.getElementById('announcementHead');
  if(head)head.innerHTML='<div><strong>Official Announcements</strong><small>Select an announcement to read it.</small></div><span class="smart-chat-verified-pill">Verified</span>';
  const stream=document.getElementById('announcementStream');
  if(stream)stream.innerHTML='<div class="chat-empty"><div class="chat-empty-icon">📢</div><div class="chat-empty-title">Select an announcement</div><div class="chat-empty-sub">Choose an official notice from the list.</div></div>';
};
function _renderDirectWorkspace() {
  return _chatChannelBack('School Chat') + `
    <div class="smart-chat-direct-shell${_directConversationId ? ' has-selection' : ''}">
      <aside class="smart-chat-direct-list">
        <div class="smart-chat-direct-list-head"><div><div class="smart-chat-kicker">PRIVATE</div><strong>Direct messages</strong></div><button type="button" onclick="_loadDirectWorkspace()" title="Refresh">↻</button></div>
        <label class="smart-chat-direct-search"><span>⌕</span><input id="directStaffSearch" placeholder="Find a teacher..." oninput="_renderDirectDirectory()"></label>
        <div id="directConversationList" class="smart-chat-conversation-list"></div>
        <div class="smart-chat-directory-title">Start a new conversation</div>
        <div id="directStaffDirectory" class="smart-chat-directory"></div>
      </aside>
      <section class="smart-chat-direct-conversation">
        <div id="directConversationHead" class="smart-chat-conversation-head"><div><strong>Select a teacher</strong><small>Only registered active staff in your school are shown.</small></div><span class="smart-chat-verified-pill">Verified staff only</span></div>
        <div id="directMessageStream" class="chat-stream smart-chat-direct-stream"><div class="chat-empty"><div class="chat-empty-icon">👤</div><div class="chat-empty-title">Choose a teacher</div><div class="chat-empty-sub">Start a private 1-on-1 conversation.</div></div></div>
        <form class="chat-composer smart-chat-direct-composer" onsubmit="return sendDirectChat(event)">
          <textarea id="directChatInput" placeholder="Select a teacher to start messaging..." rows="1" disabled oninput="_autoGrowChatInput(this)" onkeydown="_directKeydown(event)"></textarea>
          <button type="submit" class="chat-send-btn" id="directChatSendBtn" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
        </form>
      </section>
    </div>`;
}

async function _loadDirectWorkspace() {
  try {
    const [staff, conversations] = await Promise.all([API.getDirectStaffDirectory(), API.getDirectConversations()]);
    _directStaff = Array.isArray(staff) ? staff : [];
    _directConversations = Array.isArray(conversations) ? conversations : [];
    _renderDirectDirectory(); _renderDirectConversationList();
    if (_directConversationId) {
      const current = _directConversations.find(c => Number(c.conversation_id) === Number(_directConversationId));
      if (current) _directPeer = current;
      await _loadDirectMessages();
    }
  } catch (e) {
    _directStaff=[]; _directConversations=[]; _renderDirectDirectory(); _renderDirectConversationList();
    const stream=document.getElementById('directMessageStream');
    if(stream) stream.innerHTML='<div class="chat-error"><div>💬</div><div>Unable to load direct messages.</div><button class="btn-secondary" onclick="_loadDirectWorkspace()">Retry</button></div>';
  }
}

function _renderDirectConversationList() {
  const root=document.getElementById('directConversationList');
  if(!root)return;
  if(!_directConversations.length){root.innerHTML='<div class="smart-chat-list-empty">No conversations yet.</div>';return;}
  root.innerHTML=_directConversations.map(c=>`
    <button class="smart-chat-direct-item ${Number(c.conversation_id)===Number(_directConversationId)?'active':''}" onclick="openDirectChat('${esc(c.teacher_id)}')">
      <span class="smart-chat-direct-avatar">${esc((c.teacher_name||'?')[0])}</span>
      <span><strong>${esc(c.teacher_name)}</strong><small>${esc(c.last_message||'No messages yet')}</small></span>
      ${Number(c.unread_count)>0?`<b class="smart-chat-unread">${esc(c.unread_count)}</b>`:'<i></i>'}
    </button>`).join('');
}

function _renderDirectDirectory() {
  const root=document.getElementById('directStaffDirectory');
  if(!root)return;
  const q=String(document.getElementById('directStaffSearch')?.value||'').trim().toLowerCase();
  const rows=_directStaff.filter(t=>!q||String(t.teacher_name).toLowerCase().includes(q)||String(t.role||'').toLowerCase().includes(q));
  root.innerHTML=rows.length?rows.map(t=>`
    <button class="smart-chat-directory-item" onclick="openDirectChat('${esc(t.teacher_id)}')">
      <span class="smart-chat-direct-avatar">${esc((t.teacher_name||'?')[0])}</span>
      <span><strong>${esc(t.teacher_name)}</strong><small>${esc(t.role||'Teacher')}</small></span><b>›</b>
    </button>`).join(''):'<div class="smart-chat-list-empty">No active teacher found.</div>';
}

window.openDirectChat=async function(teacherId){
  try{
    const result=await API.openDirectConversation(teacherId);
    if(!result?.ok)throw new Error(result?.error||'Unable to open conversation');
    _directConversationId=Number(result.conversation_id);
    _directPeer=result.peer||_directStaff.find(t=>t.teacher_id===teacherId)||null;
    _setDirectMobileView(true);
    _renderDirectConversationList();_renderDirectHeader();_setDirectComposer(true);
    await _loadDirectMessages();
  }catch(e){showToast('Unable to open this staff conversation.');}
};

function _renderDirectHeader(){
  const root=document.getElementById('directConversationHead');
  if(!root||!_directPeer)return;
  root.innerHTML=`
    <div class="smart-chat-direct-peer"><button class="smart-chat-mobile-back" onclick="_clearDirectSelection()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><span class="smart-chat-direct-avatar large">${esc((_directPeer.teacher_name||'?')[0])}</span><div><strong>${esc(_directPeer.teacher_name)}</strong><small>${esc(_directPeer.role||'Teacher')} · Private 1-on-1</small></div></div>
    <span class="smart-chat-verified-pill">Private</span>`;
}

function _setDirectMobileView(selected) {
  const shell = document.querySelector('.smart-chat-direct-shell');
  if (shell) shell.classList.toggle('has-selection', !!selected);
}

function _setDirectComposer(enabled){
  const input=document.getElementById('directChatInput'),btn=document.getElementById('directChatSendBtn');
  if(input){input.disabled=!enabled;input.placeholder=enabled?'Write a private message...':'Select a teacher to start messaging...';}
  if(btn)btn.disabled=!enabled;
}

window._clearDirectSelection=function(){_directConversationId=null;_directPeer=null;_setDirectMobileView(false);_renderChatMode();};

async function _loadDirectMessages(){
  if(!_directConversationId)return;
  try{
    const rows=await API.getDirectMessages(_directConversationId,50);
    const stream=document.getElementById('directMessageStream');
    if(!stream)return;
    if(!rows.length)stream.innerHTML='<div class="chat-empty"><div class="chat-empty-icon">💬</div><div class="chat-empty-title">New conversation</div><div class="chat-empty-sub">Send the first private message.</div></div>';
    else _renderDirectMessages(rows);
    _renderDirectHeader();_setDirectComposer(true);await API.markDirectRead(_directConversationId);
  }catch(e){
    const stream=document.getElementById('directMessageStream');
    if(stream)stream.innerHTML='<div class="chat-error"><div>💬</div><div>Unable to load conversation.</div><button class="btn-secondary" onclick="_loadDirectMessages()">Retry</button></div>';
  }
}

function _renderDirectMessages(messages){
  const stream=document.getElementById('directMessageStream');
  if(!stream)return;
  const grouped={};
  messages.forEach(m=>{const day=(m.created_at||'').slice(0,10)||'unknown';(grouped[day]??=[]).push(m);});
  const myId=window.APP?.teacher_id;
  stream.innerHTML=Object.keys(grouped).sort().map(day=>`
    <div class="chat-day-sep"><span>${esc(_humanDay(day))}</span></div>
    ${grouped[day].map(m=>{
      const mine=m.sender_teacher_id===myId;
      const time=m.created_at?new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
      return `<div class="chat-bubble-row ${mine?'mine':'theirs'}"><div class="chat-bubble"><div class="chat-bubble-text">${esc(m.text||'')}</div><div class="chat-bubble-time">${esc(time)}</div></div></div>`;
    }).join('')}`).join('');
  if(!_chatScrollLock)requestAnimationFrame(()=>{stream.scrollTop=stream.scrollHeight;});
}

window.sendDirectChat=async function(ev){
  ev?.preventDefault?.();
  const input=document.getElementById('directChatInput'),btn=document.getElementById('directChatSendBtn'),value=input?.value.trim();
  if(!_directConversationId||!value||!btn)return false;
  btn.disabled=true;input.disabled=true;
  try{
    const result=await API.sendDirectMessage(_directConversationId,value);
    if(!result?.ok)throw new Error(result?.error||'Send failed');
    input.value='';input.style.height='auto';await _loadDirectWorkspace();await _loadDirectMessages();
  }catch(e){showToast('Message could not be sent.');}
  finally{btn.disabled=false;input.disabled=false;input.focus();}
  return false;
};

window._directKeydown=function(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();sendDirectChat(ev);}};

window._showSchoolChatChannels = function() { _chatChannel='staff'; _renderChatMode(); };

function _chatChannelBack(label='School Chat') {
  return `<div class="smart-chat-channel-back-row"><button type="button" class="smart-chat-channel-back" onclick="_showSchoolChatChannels()" aria-label="Back to School Chat">‹ <span>${esc(label)}</span></button></div>`;
}

window.switchChatChannel = function(channel) {
  _chatChannel = channel;
  if (_chatMode !== 'school') return;
  _renderChatMode();
};

async function _loadChatMessages() {
  if (_chatMode !== 'school') return;
  try {
    const messages = await API.getChatMessages(_chatChannel, 50);
    window.APP.chatMessages = Array.isArray(messages) ? messages : [];
    _renderChatStream(window.APP.chatMessages);
  } catch (e) {
    const stream = document.getElementById('chatStream');
    if (stream) stream.innerHTML = `<div class="chat-error"><div>💬</div><div>${t('chat.loadFailed')}</div><button class="btn-secondary" onclick="renderChat()">${t('chat.retry')}</button></div>`;
  }
}

function _renderChatStream(messages) {
  const stream = document.getElementById('chatStream');
  if (!stream) return;
  if (!messages.length) {
    stream.innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">💬</div><div class="chat-empty-title">${t('chat.emptyTitle')}</div><div class="chat-empty-sub">${t('chat.emptySub')}</div></div>`;
    return;
  }
  const grouped = {};
  messages.forEach(m => {
    const day = (m.created_at || m.sent_at || '').slice(0,10) || 'unknown';
    (grouped[day] = grouped[day] || []).push(m);
  });
  const myId = window.APP.teacher_id;
  stream.innerHTML = Object.keys(grouped).sort().map(day => `
    <div class="chat-day-sep"><span>${esc(_humanDay(day))}</span></div>
    ${grouped[day].map(m => {
      const mine = m.teacher_id === myId;
      const when = m.created_at || m.sent_at;
      const time = when ? new Date(when).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
      const author = m.teacher_name || 'Unknown';
      return `<div class="chat-bubble-row ${mine?'mine':'theirs'}${m.failed?' failed':''}${m.pending?' pending':''}">
        ${mine?'':`<div class="chat-bubble-avatar">${esc((author||'?')[0])}</div>`}
        <div class="chat-bubble">
          ${mine?'':`<div class="chat-bubble-author">${esc(author)}</div>`}
          <div class="chat-bubble-text">${esc(m.text||'')}</div>
          <div class="chat-bubble-time">${esc(time)}${m.pending?' · …':''}${m.failed?' · failed':''}</div>
        </div>
      </div>`;
    }).join('')}`).join('');
  if (!_chatScrollLock) requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
}

function _humanDay(iso) {
  if (!iso || iso === 'unknown') return '';
  const today = new Date().toISOString().slice(0,10);
  const yest = new Date(Date.now()-86400000).toISOString().slice(0,10);
  if (iso === today) return 'Today';
  if (iso === yest) return 'Yesterday';
  try { return new Date(iso).toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'short'}); }
  catch { return iso; }
}

window.sendChat = async function(ev) {
  ev?.preventDefault?.();
  const input=document.getElementById('chatInput'), btn=document.getElementById('chatSendBtn');
  const text=input?.value.trim();
  if (_chatChannel !== 'staff') {
    showToast('This channel is preview-only until its verified server route is connected.');
    return false;
  }
  if (!text || !btn) return false;
  btn.disabled=true; input.disabled=true;
  const optimistic={text,teacher_id:window.APP.teacher_id,teacher_name:window.APP.teacher_name,channel:_chatChannel,school_id:window.APP.school_id,created_at:new Date().toISOString(),pending:true};
  window.APP.chatMessages=Array.isArray(window.APP.chatMessages)?window.APP.chatMessages:[];
  window.APP.chatMessages.push(optimistic); _renderChatStream(window.APP.chatMessages);
  input.value=''; input.style.height='auto';
  try {
    const result=await API.sendChatMessage(_chatChannel,text);
    if(result&&(result.ok===true||result.success===true)){
      delete optimistic.pending;
      if(result.message){const idx=window.APP.chatMessages.indexOf(optimistic);if(idx>=0)window.APP.chatMessages[idx]=result.message;}
      _renderChatStream(window.APP.chatMessages); setTimeout(_loadChatMessages,1200);
    } else throw new Error((result&&(result.error||result.message))||'Send failed');
  } catch(e) {
    optimistic.failed=true; delete optimistic.pending; _renderChatStream(window.APP.chatMessages); showToast(t('chat.sendFailed'));
  } finally { btn.disabled=false; input.disabled=false; input.focus(); }
  return false;
};

window._aiPrompt = function(value) {
  const input=document.getElementById('aiChatInput');
  const v=String(value||'').trim();
  if(!v) return;
  if(input) input.value='';
  showToast('AI preview: ' + v);
};

window.startChatPolling=function(){
  if(_chatPollTimer)return;
  _chatPollTimer=setInterval(async ()=>{
    if(window.APP?.currentPage!=='chat')return;
    if(_chatMode==='school' && _chatChannel==='direct'){
      if(_directPollBusy)return;
      _directPollBusy=true;
      try{
        await _loadDirectWorkspace();
      }finally{
        _directPollBusy=false;
      }
    }else if(_chatMode==='school'){
      _loadChatMessages();
    }
  },5000);
};
window.stopChatPolling=function(){
  if(_chatPollTimer){clearInterval(_chatPollTimer);_chatPollTimer=null;}
  _directPollBusy=false;
};
window._autoGrowChatInput=function(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px';};
window._chatKeydown=function(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();sendChat(ev);}};
