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

  async getDirectStaffDirectory() {
      const res = await _webRpc('rpc_chat_staff_directory', {
        p_session_token: _webSessionToken(),
      });
      return Array.isArray(res.rows) ? res.rows : [];
    },

  async getDirectConversations() {
      const res = await _webRpc('rpc_chat_direct_conversations', {
        p_session_token: _webSessionToken(),
      });
      return Array.isArray(res.rows) ? res.rows : [];
    },

  async openDirectConversation(teacherId) {
      return _webRpc('rpc_chat_direct_open', {
        p_session_token: _webSessionToken(),
        p_teacher_id: teacherId,
      });
    },

  async getDirectMessages(conversationId, limit = 50) {
      const res = await _webRpc('rpc_chat_direct_messages', {
        p_session_token: _webSessionToken(),
        p_conversation_id: Number(conversationId),
        p_limit: Number(limit) || 50,
      });
      return Array.isArray(res.rows) ? res.rows : [];
    },

  async sendDirectMessage(conversationId, text, replyToId = null) {
      return _webRpc('rpc_chat_direct_send', {
        p_session_token: _webSessionToken(),
        p_conversation_id: Number(conversationId),
        p_text: text,
        p_reply_to_id: replyToId == null ? null : Number(replyToId),
      });
    },

  async markDirectRead(conversationId) {
      return _webRpc('rpc_chat_direct_mark_read', {
        p_session_token: _webSessionToken(),
        p_conversation_id: Number(conversationId),
      });
    },
  
    // ─── REFRESH ALL ─────────────────────────────────────────────────────────
});
window.API = API;
