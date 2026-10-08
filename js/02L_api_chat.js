/** SCMS v12 — 02L_api_chat.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async getChatMessages(channel = 'staff', limit = 50) { try { const res = await _webRpc('rpc_get_chat_messages', {p_session_token:_webSessionToken(),p_channel:channel,p_limit:Number(limit)||50}); return Array.isArray(res.rows)?res.rows:[]; } catch(err){ console.warn('[chat] read failed',err); return []; } },
  async getChatRecipientPreview(recipientType='all_staff',target=null){ const res=await _webRpc('rpc_chat_recipient_preview',{p_session_token:_webSessionToken(),p_recipient_type:recipientType,p_target:target}); return Array.isArray(res.rows)?res.rows:[]; },
  async sendChatMessage(channel,text){ return _webRpc('rpc_send_chat_message',{p_session_token:_webSessionToken(),p_channel:channel,p_text:text}); },
  async getDirectStaffDirectory(){ const res=await _webRpc('rpc_chat_staff_directory',{p_session_token:_webSessionToken()}); return Array.isArray(res.rows)?res.rows:[]; },
  async getDirectConversations(){ const res=await _webRpc('rpc_chat_direct_conversations',{p_session_token:_webSessionToken()}); return Array.isArray(res.rows)?res.rows:[]; },
  async openDirectConversation(teacherId){ return _webRpc('rpc_chat_direct_open',{p_session_token:_webSessionToken(),p_teacher_id:teacherId}); },
  async getDirectMessages(conversationId,limit=50){ const res=await _webRpc('rpc_chat_direct_messages',{p_session_token:_webSessionToken(),p_conversation_id:Number(conversationId),p_limit:Number(limit)||50}); return Array.isArray(res.rows)?res.rows:[]; },
  async sendDirectMessage(conversationId,text,replyToId=null){ return _webRpc('rpc_chat_direct_send',{p_session_token:_webSessionToken(),p_conversation_id:Number(conversationId),p_text:text,p_reply_to_id:replyToId==null?null:Number(replyToId)}); },
  async markDirectRead(conversationId){ return _webRpc('rpc_chat_direct_mark_read',{p_session_token:_webSessionToken(),p_conversation_id:Number(conversationId)}); },
  async createStaffAnnouncement(recipientType,target,messageType,reason,body){ return _webRpc('rpc_chat_announcement_create',{p_session_token:_webSessionToken(),p_recipient_type:recipientType,p_target:target,p_message_type:messageType,p_reason:reason,p_body:body}); },
  async getStaffAnnouncements(limit=50){ const res=await _webRpc('rpc_chat_announcement_list',{p_session_token:_webSessionToken(),p_limit:Number(limit)||50}); return Array.isArray(res.rows)?res.rows:[]; },
  async markStaffAnnouncementRead(announcementId){ return _webRpc('rpc_chat_announcement_mark_read',{p_session_token:_webSessionToken(),p_announcement_id:announcementId}); },
  async createInquiryTicket(subject,body,studentId=null,priority='NORMAL'){ return _webRpc('rpc_chat_inquiry_create',{p_session_token:_webSessionToken(),p_subject:subject,p_body:body,p_student_id:studentId,p_priority:priority}); },
  async getInquiryTickets(status=null,limit=50){ const res=await _webRpc('rpc_chat_inquiry_list',{p_session_token:_webSessionToken(),p_status:status,p_limit:Number(limit)||50}); return Array.isArray(res.rows)?res.rows:[]; },
  async openInquiryTicket(ticketId){ return _webRpc('rpc_chat_inquiry_open',{p_session_token:_webSessionToken(),p_ticket_id:Number(ticketId)}); },
  async sendInquiryMessage(ticketId,body){ return _webRpc('rpc_chat_inquiry_send',{p_session_token:_webSessionToken(),p_ticket_id:Number(ticketId),p_body:body}); },
  async markInquiryRead(ticketId){ return _webRpc('rpc_chat_inquiry_mark_read',{p_session_token:_webSessionToken(),p_ticket_id:Number(ticketId)}); },
  async updateInquiryTicket(ticketId,status=null,assignedTeacherId=null){ return _webRpc('rpc_chat_inquiry_update',{p_session_token:_webSessionToken(),p_ticket_id:Number(ticketId),p_status:status,p_assigned_teacher_id:assignedTeacherId||null}); },
  async getChatGroups(groupType=null,limit=50){ const res=await _webRpc('rpc_chat_group_list',{p_session_token:_webSessionToken(),p_group_type:groupType,p_limit:Number(limit)||50}); return Array.isArray(res.rows)?res.rows:[]; },
  async createChatGroup(name,description=null,groupType='PROJECT',startsAt=null,endsAt=null,memberTeacherIds=[]){ return _webRpc('rpc_chat_group_create',{p_session_token:_webSessionToken(),p_name:name,p_description:description,p_group_type:groupType,p_starts_at:startsAt,p_ends_at:endsAt,p_member_teacher_ids:Array.isArray(memberTeacherIds)?memberTeacherIds:[]}); },
  async openChatGroup(groupId){ return _webRpc('rpc_chat_group_open',{p_session_token:_webSessionToken(),p_group_id:Number(groupId)}); },
  async sendChatGroupMessage(groupId,body){ return _webRpc('rpc_chat_group_send',{p_session_token:_webSessionToken(),p_group_id:Number(groupId),p_body:body}); },
  async markChatGroupRead(groupId){ return _webRpc('rpc_chat_group_mark_read',{p_session_token:_webSessionToken(),p_group_id:Number(groupId)}); }
});
window.API=API;
