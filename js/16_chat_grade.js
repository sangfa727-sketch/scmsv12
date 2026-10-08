'use strict';
let _gradeRows=[],_gradeName=null,_gradePollTimer=null;
function _renderGradeWorkspace(){
 const root=document.getElementById('smartChatModeBody'); if(!root)return;
 root.innerHTML=`<div class="smart-chat-list-title">Department & Grade <span style="float:right"><button type="button" class="btn-pill-action" onclick="_showDepartmentWorkspace()">Department</button> <button type="button" class="btn-pill-action" disabled>Grade</button></span></div><div class="smart-chat-school-grid"><aside class="smart-chat-channel-list"><div class="smart-chat-list-title">Grade Chat</div><div class="smart-chat-directory-title">Only teachers assigned to a grade can enter its conversation.</div><div id="gradeList" class="smart-chat-conversation-list"></div></aside><section class="smart-chat-conversation" id="gradeConversation"><div class="chat-empty"><div class="chat-empty-icon">🎓</div><div class="chat-empty-title">Select a grade</div><div class="chat-empty-sub">Grade staff conversations are school-isolated.</div></div></section></div>`;
 _loadGradeWorkspace();
}
async function _loadGradeWorkspace(){try{_gradeRows=await API.getGradeChats();_renderGradeList();if(_gradeName&&_gradeRows.some(x=>x.grade_name===_gradeName))await _openGradeChat(_gradeName);}catch(e){const b=document.getElementById('gradeList');if(b)b.innerHTML='<div class="chat-error">Unable to load grades.</div>';}}
function _renderGradeList(){
 const b=document.getElementById('gradeList');if(!b)return;
 b.innerHTML=_gradeRows.length?_gradeRows.map(g=>{
   const safe=String(g.grade_name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
   return '<button data-testid="grade-row-'+esc(g.grade_name)+'" class="smart-chat-channel-card '+(g.grade_name===_gradeName?'active':'')+'" onclick="_openGradeChat(\''+esc(safe)+'\')"><span class="smart-chat-channel-icon">🎓</span><span><strong>'+esc(g.grade_name)+'</strong><small>'+(Number(g.unread_count)>0?esc(g.unread_count)+' unread':'Staff conversation')+'</small></span><b>›</b></button>';
 }).join(''):'<div class="chat-empty-sub">No grade assignment has been found for this staff account.</div>';
}
async function _openGradeChat(name,silent=false){
 _gradeName=String(name||'').trim();const root=document.getElementById('gradeConversation');if(!root||!_gradeName)return;
 try{
  const r=await API.openGradeChat(_gradeName);if(!r?.ok)throw new Error(r?.error||'Unauthorized');
  const msgs=Array.isArray(r.rows)?r.rows:[];
  const messageHtml=msgs.length?msgs.map(m=>{
   const mine=m.sender_teacher_id===window.APP?.teacher_id;
   const author=mine?'You':esc(m.sender_teacher_name||'Staff');
   const avatar=mine?'':('<div class="chat-bubble-avatar">'+esc((m.sender_teacher_name||'?')[0])+'</div>');
   const time=esc(m.created_at?new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'');
   return '<div class="chat-bubble-row '+(mine?'mine':'theirs')+'">'+avatar+'<div class="chat-bubble"><div class="chat-bubble-author">'+author+'</div><div class="chat-bubble-text">'+esc(m.body||'')+'</div><div class="chat-bubble-time">'+time+'</div></div></div>';
  }).join(''):'<div class="chat-empty"><div class="chat-empty-icon">🎓</div><div class="chat-empty-title">No messages yet</div><div class="chat-empty-sub">Start the grade conversation.</div></div>';
  root.innerHTML='<div class="smart-chat-conversation-head"><div><strong>'+esc(r.grade_name||_gradeName)+'</strong><small>Staff-only grade conversation</small></div><span class="smart-chat-verified-pill">School isolated</span></div><div class="chat-stream" id="gradeMessageStream">'+messageHtml+'</div><form class="chat-composer" onsubmit="return _sendGradeFromComposer(event)"><textarea id="gradeChatInput" rows="1" placeholder="Write a grade message..." oninput="_autoGrowChatInput(this)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();_sendGradeFromComposer(event)}"></textarea><button type="submit" class="chat-send-btn">'+_chatIcon('send')+'</button></form>';
  requestAnimationFrame(()=>{const s=document.getElementById('gradeMessageStream');if(s)s.scrollTop=s.scrollHeight;});
  await API.markGradeRead(_gradeName);if(!silent)_startGradePolling();_renderGradeList();
 }catch(e){if(!silent)showToast('Grade access is not authorized.');}
}
function _startGradePolling(){if(_gradePollTimer)clearInterval(_gradePollTimer);_gradePollTimer=setInterval(()=>{if(document.getElementById('gradeMessageStream')&&_gradeName)_openGradeChat(_gradeName,true).catch(()=>{});},5000);}
window._sendGradeFromComposer=async function(ev){ev?.preventDefault?.();const i=document.getElementById('gradeChatInput'),v=i?.value.trim();if(!_gradeName||!v)return false;try{const r=await API.sendGradeMessage(_gradeName,v);if(!r?.ok)throw new Error(r?.error||'Send failed');i.value='';await _openGradeChat(_gradeName);}catch(e){showToast('Grade message could not be sent.');}return false;};
window._showGradeWorkspace=function(){_renderGradeWorkspace();};
window._showDepartmentWorkspace=function(){const r=document.getElementById('smartChatModeBody');if(r){r.innerHTML=_renderDepartmentWorkspace();_loadDepartmentWorkspace();}};
window._renderGradeWorkspace=_renderGradeWorkspace;
window._clearGradeSelection=function(){if(_gradePollTimer)clearInterval(_gradePollTimer);_gradePollTimer=null;_gradeName=null;_renderGradeWorkspace();};
