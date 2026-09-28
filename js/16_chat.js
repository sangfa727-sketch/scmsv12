/**
 * SCMS v11 — 16_chat.js
 * Telegram-style staff chat — visible only when the app is running NATIVELY
 * (Capacitor, PWA, or standalone web). Inside Telegram itself (TWA) the user
 * already has Telegram around the app, so we hide the chat to avoid
 * duplication. When the app is wrapped with Capacitor and shipped to the App
 * Store / Play Store, this becomes the team's in-app messenger.
 *
 * Storage:
 *   • Messages live in Supabase / your backend (table: chat_messages).
 *   • API.getChatMessages / API.sendChatMessage handle persistence.
 *   • Polling every 8s while the chat page is visible — replace with a
 *     Supabase Realtime channel later if desired.
 */

'use strict';

let _chatChannel    = 'staff';
let _chatPollTimer  = null;
let _chatScrollLock = false;

function renderChat() {
  // Channels (placeholder; backend can return a list)
  const channels = [
    { id: 'staff',     name: 'Staff Room',    icon: '👥' },
    { id: 'admin',     name: 'Admin only',    icon: '🛡️', adminOnly: true },
    { id: 'p3',        name: 'P3 Teachers',   icon: '📚' },
    { id: 'p4',        name: 'P4 Teachers',   icon: '📚' },
  ];

  const visibleChannels = channels.filter(c => !c.adminOnly || window.APP.is_admin);

  const channelTabs = visibleChannels.map(c => `
    <button class="chat-channel-tab ${c.id === _chatChannel ? 'active' : ''}"
      data-channel="${esc(c.id)}" onclick="switchChatChannel('${esc(c.id)}')">
      <span class="chat-channel-icon">${c.icon}</span>
      <span>${esc(c.name)}</span>
    </button>`).join('');

  const page = document.getElementById('page-chat');
  if (!page) return;

  page.innerHTML = `
    <div class="chat-shell">
      <div class="chat-topbar">
        <div class="chat-channel-strip">${channelTabs}</div>
      </div>

      <div class="chat-stream" id="chatStream">
        ${skeletonCards(2)}
      </div>

      <form class="chat-composer" id="chatComposer" onsubmit="return sendChat(event)">
        <textarea id="chatInput" placeholder="${esc(t('chat.ph'))}" rows="1"
                  oninput="_autoGrowChatInput(this)"
                  onkeydown="_chatKeydown(event)"></textarea>
        <button type="submit" class="chat-send-btn" id="chatSendBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </form>
    </div>`;

  _loadChatMessages();
}

window.switchChatChannel = function(channel) {
  _chatChannel = channel;
  document.querySelectorAll('.chat-channel-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.channel === channel)
  );
  document.getElementById('chatStream').innerHTML = skeletonCards(2);
  _loadChatMessages();
};

async function _loadChatMessages() {
  try {
    // API.getChatMessages now returns the raw array (oldest first) from Supabase
    const messages = await API.getChatMessages(_chatChannel, 50);
    window.APP.chatMessages = Array.isArray(messages) ? messages : [];
    _renderChatStream(window.APP.chatMessages);
  } catch (e) {
    const stream = document.getElementById('chatStream');
    if (stream) {
      stream.innerHTML = `
        <div class="chat-error">
          <div>💬</div>
          <div>${t('chat.loadFailed')}</div>
          <button class="btn-secondary" style="margin-top:12px; width:auto; padding:0 20px;" onclick="renderChat()">${t('chat.retry')}</button>
        </div>`;
    }
  }
}

function _renderChatStream(messages) {
  const stream = document.getElementById('chatStream');
  if (!stream) return;

  if (!messages.length) {
    stream.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty-icon">💬</div>
        <div class="chat-empty-title">${t('chat.emptyTitle')}</div>
        <div class="chat-empty-sub">${t('chat.emptySub')}</div>
      </div>`;
    return;
  }

  // Group by day for date separators
  const grouped = {};
  messages.forEach(m => {
    const day = (m.created_at || m.sent_at || '').slice(0, 10) || 'unknown';
    (grouped[day] = grouped[day] || []).push(m);
  });

  const myId = window.APP.teacher_id;

  const html = Object.keys(grouped).sort().map(day => {
    const dayLabel = _humanDay(day);
    const bubbles = grouped[day].map(m => {
      const mine = m.teacher_id === myId;
      const when = m.created_at || m.sent_at;
      const time = when ? new Date(when).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '';
      const author = m.teacher_name || 'Unknown';
      return `
        <div class="chat-bubble-row ${mine ? 'mine' : 'theirs'}${m.failed ? ' failed' : ''}${m.pending ? ' pending' : ''}">
          ${mine ? '' : `<div class="chat-bubble-avatar">${esc((author || '?')[0])}</div>`}
          <div class="chat-bubble">
            ${mine ? '' : `<div class="chat-bubble-author">${esc(author)}</div>`}
            <div class="chat-bubble-text">${esc(m.text || '')}</div>
            <div class="chat-bubble-time">${esc(time)}${m.pending ? ' · …' : ''}${m.failed ? ' · failed' : ''}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="chat-day-sep"><span>${esc(dayLabel)}</span></div>
      ${bubbles}`;
  }).join('');

  stream.innerHTML = html;
  if (!_chatScrollLock) {
    requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
  }
}

function _humanDay(iso) {
  if (!iso || iso === 'unknown') return '';
  const today = new Date().toISOString().slice(0, 10);
  const yest  = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (iso === today) return 'Today';
  if (iso === yest)  return 'Yesterday';
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'short' });
  } catch { return iso; }
}

window.sendChat = async function(ev) {
  ev?.preventDefault?.();
  const input = document.getElementById('chatInput');
  const btn   = document.getElementById('chatSendBtn');
  const text  = input?.value.trim();
  if (!text) return false;

  btn.disabled = true;
  input.disabled = true;

  // Optimistic append — schema must match Supabase chat_messages
  const optimistic = {
    text,
    teacher_id:   window.APP.teacher_id,
    teacher_name: window.APP.teacher_name,
    channel:      _chatChannel,
    school_id:    window.APP.school_id,
    created_at:   new Date().toISOString(),
    pending:      true,
  };
  window.APP.chatMessages.push(optimistic);
  _renderChatStream(window.APP.chatMessages);
  input.value = '';
  input.style.height = 'auto';

  try {
    const result = await API.sendChatMessage(_chatChannel, text);
    if (result && (result.ok === true || result.success === true)) {
      // Drop the optimistic flag — the row is real now
      delete optimistic.pending;
      // Server may return the saved row; if so, swap it in
      if (result.message) {
        const idx = window.APP.chatMessages.indexOf(optimistic);
        if (idx >= 0) window.APP.chatMessages[idx] = result.message;
      }
      _renderChatStream(window.APP.chatMessages);
      // Re-fetch shortly to pick up other people's messages
      setTimeout(_loadChatMessages, 1200);
    } else {
      throw new Error((result && (result.error || result.message)) || 'Send failed');
    }
  } catch (e) {
    optimistic.failed = true;
    delete optimistic.pending;
    _renderChatStream(window.APP.chatMessages);
    showToast(t('chat.sendFailed'));
  } finally {
    btn.disabled = false;
    input.disabled = false;
    input.focus();
  }
  return false;
};

// Start / stop polling when the chat page becomes visible / hidden
window.startChatPolling = function() {
  if (_chatPollTimer) return;
  _chatPollTimer = setInterval(() => {
    if (window.APP.currentPage === 'chat') _loadChatMessages();
  }, 8000);
};

window.stopChatPolling = function() {
  if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
};

window._autoGrowChatInput = function(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
};

window._chatKeydown = function(ev) {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    sendChat(ev);
  }
};
