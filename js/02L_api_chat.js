/** SCMS v12 — 02L_api_chat.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async getChatMessages(channel = 'staff', limit = 50) {
      try {
        const res = await _webRpc('rpc_get_chat_messages', {
          p_session_token: _webSessionToken(),
          p_channel: channel, p_limit: Number(limit) || 50,
        });
        return Array.isArray(res.rows) ? res.rows : [];   // oldest first
      } catch (err) {
        console.warn('[chat] read failed', err);
        return [];
      }
    },
  
  async getChatRecipientPreview(recipientType = 'all_staff', target = null) {
      const res = await _webRpc('rpc_chat_recipient_preview', {
        p_session_token: _webSessionToken(),
        p_recipient_type: recipientType,
        p_target: target,
      });
      return Array.isArray(res.rows) ? res.rows : [];
    },

  async sendChatMessage(channel, text) {
      // school/teacher identity comes from the session on the server
      return _webRpc('rpc_send_chat_message', {
        p_session_token: _webSessionToken(),
        p_channel: channel, p_text: text,
      });
    },
  
    // ─── REFRESH ALL ─────────────────────────────────────────────────────────
});
window.API = API;
