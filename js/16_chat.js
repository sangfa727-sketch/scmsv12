/**
 * SCMS v12 — Smart Staff Chat
 * UX layer: one compact communication center with a hard separation between
 * School Chat and AI Operations. The Admin Composer below is PREVIEW ONLY:
 * it never calls a send API.
 */
'use strict';

let _chatChannel = 'staff';
let _chatPollTimer = null;
let _chatScrollLock = false;
let _chatMode = 'school';

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
  // Important: never manufacture a teacher name. Until a server-side
  // directory endpoint exists, only already-verified bootstrap staff may appear.
  const staff = _verifiedStaffList();
  return staff.filter(t => {
    const classes = String(t.classes || '');
    const assigned = Array.isArray(t.classes) ? t.classes : classes.split(/[,|]/).map(x => x.trim()).filter(Boolean);
    return assigned.some(x => x.toLowerCase() === String(grade).toLowerCase());
  });
}

function _renderAdminComposer() {
  if (!window.APP?.is_admin) return '';
  const recipients = _gradeRecipientPreview('Grade 5');
  return `
    <section class="smart-chat-admin-card" aria-label="Admin message composer preview">
      <div class="smart-chat-section-head">
        <div>
          <div class="smart-chat-kicker">ADMIN TOOLS</div>
          <h2>Official message</h2>
          <p>Recipient routing is verified before any real send is enabled.</p>
        </div>
        <span class="smart-chat-preview-badge">PREVIEW ONLY</span>
      </div>

      <div class="smart-chat-form-grid">
        <label>Recipient type
          <select id="adminMsgRecipientType" onchange="_refreshAdminComposerPreview()">
            <option value="grade" selected>Grade</option>
            <option value="department">Department</option>
            <option value="teacher">Individual teacher</option>
          </select>
        </label>
        <label>Grade
          <select id="adminMsgGrade" onchange="_refreshAdminComposerPreview()">
            <option value="Grade 5" selected>Grade 5</option>
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
          <input id="adminMsgReason" value="အတန်းတာဝန်နှင့် သက်ဆိုင်သော အသိပေးချက်"
                 oninput="_refreshAdminComposerPreview()">
        </label>
      </div>

      <label class="smart-chat-body-field">Body
        <textarea id="adminMsgBody" rows="3" placeholder="ရေးသားရန်..." oninput="_refreshAdminComposerPreview()"></textarea>
      </label>

      <div class="smart-chat-routing-status ${recipients.length ? 'verified' : 'blocked'}" id="adminMsgRoutingStatus">
        <span class="smart-chat-status-dot"></span>
        <div>
          <strong>${recipients.length ? recipients.length + ' verified recipient(s)' : 'No verified Grade 5 recipient'}</strong>
          <small>${recipients.length ? recipients.map(t => esc(t.teacher_name)).join(', ') : 'System will not invent or display a teacher who is not registered and active in this school.'}</small>
        </div>
      </div>

      <div class="smart-chat-official-preview" id="adminMsgPreview"></div>

      <div class="smart-chat-form-actions">
        <button type="button" class="btn-secondary" onclick="_refreshAdminComposerPreview()">Refresh preview</button>
        <button type="button" class="smart-chat-send-disabled" disabled title="Prototype only — sending is intentionally disabled">
          ${_chatIcon('send')} Send disabled
        </button>
      </div>
    </section>`;
}

window._refreshAdminComposerPreview = function() {
  const box = document.getElementById('adminMsgPreview');
  if (!box) return;
  const grade = document.getElementById('adminMsgGrade')?.value || 'Grade 5';
  const type = document.getElementById('adminMsgType')?.value || 'announcement';
  const reason = document.getElementById('adminMsgReason')?.value.trim() || '—';
  const body = document.getElementById('adminMsgBody')?.value.trim() || '—';
  const recipients = _gradeRecipientPreview(grade);
  const header = type === 'announcement'
    ? 'Official Announcements Channel'
    : type === 'task' ? 'Official Staff Task' : 'Staff Notice';
  box.innerHTML = `
    <div class="smart-chat-preview-label">SYSTEM-GENERATED HEADER</div>
    <div class="smart-chat-preview-header">${esc(header)}</div>
    <div class="smart-chat-preview-meta">Grade: ${esc(grade)} · Verified recipients: ${recipients.length}</div>
    <div class="smart-chat-preview-reason"><strong>Reason</strong><span>${esc(reason)}</span></div>
    <div class="smart-chat-preview-body">${esc(body).replace(/\n/g, '<br>')}</div>
  `;
};

function renderChat() {
  const page = document.getElementById('page-chat');
  if (!page) return;

  page.innerHTML = `
    <div class="smart-chat-shell">
      <div class="smart-chat-hero">
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
        <div class="smart-chat-ai-note">AI Operations will use the existing authorization/confirmation layer before any real system action is executed.</div>
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
  const visible = channels.filter(c => c.id === 'staff' || window.APP?.is_admin || c.id === 'direct');
  root.innerHTML = `
    <div class="smart-chat-school-grid">
      <aside class="smart-chat-channel-list">
        <div class="smart-chat-list-title">School Chat</div>
        ${visible.map(c => `
          <button class="smart-chat-channel-card ${c.id === _chatChannel ? 'active' : ''}" onclick="switchChatChannel('${esc(c.id)}')">
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
          <textarea id="chatInput" placeholder="${esc(t('chat.ph'))}" rows="1" oninput="_autoGrowChatInput(this)" onkeydown="_chatKeydown(event)"></textarea>
          <button type="submit" class="chat-send-btn" id="chatSendBtn">${_chatIcon('send')}</button>
        </form>
      </section>
    </div>
    ${_renderAdminComposer()}`;
  _loadChatMessages();
  setTimeout(_refreshAdminComposerPreview, 0);
}

window.switchChatChannel = function(channel) {
  _chatChannel = channel;
  if (_chatMode !== 'school') return;
  document.querySelectorAll('.smart-chat-channel-card').forEach(b =>
    b.classList.toggle('active', b.querySelector('strong')?.textContent && b.onclick)
  );
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

window.startChatPolling=function(){if(_chatPollTimer)return;_chatPollTimer=setInterval(()=>{if(window.APP.currentPage==='chat')_loadChatMessages();},8000);};
window.stopChatPolling=function(){if(_chatPollTimer){clearInterval(_chatPollTimer);_chatPollTimer=null;}};
window._autoGrowChatInput=function(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px';};
window._chatKeydown=function(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();sendChat(ev);}};
