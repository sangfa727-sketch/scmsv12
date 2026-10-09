'use strict';
let _chatGroups=[],_chatGroupId=null,_chatGroupCurrent=null;
function _renderGroupWorkspace(){
 const root=document.getElementById('smartChatModeBody'); if(!root)return;
 root.innerHTML=_chatChannelBack(t('chat.schoolChat')) + `<div class="smart-chat-direct-shell smart-chat-group-shell${_chatGroupId ? ' has-selection' : ''}"><aside class="smart-chat-direct-list"><div class="smart-chat-direct-list-head"><div><div class="smart-chat-kicker">${t('chat.groupChat')}</div><strong>${t('chat.workspace.groups')}</strong></div><button type="button" class="smart-chat-refresh-btn" onclick="_loadChatGroups(false)" title="${t('chat.refresh')}">↻</button></div><button class="smart-chat-channel-card" onclick="_newChatGroup()"><span class="smart-chat-channel-icon">＋</span><span><strong>${t('chat.newGroup')}</strong><small>${t('chat.newGroupDescription')}</small></span><b>›</b></button><div id="chatGroupList"></div></aside><section class="smart-chat-direct-conversation" id="chatGroupConversation"><div class="chat-empty"><div class="chat-empty-icon">🗂️</div><div class="chat-empty-title">${t('chat.selectGroup')}</div><div class="chat-empty-sub">${t('chat.groupSchoolIsolated')}</div></div></section></div>`;
 _loadChatGroups();
}
async function _loadChatGroups(autoOpen=true){
 try{const box=document.getElementById('chatGroupList');if(box)box.innerHTML=skeletonCards(2);_chatGroups=await API.getChatGroups();if(box)box.innerHTML=_chatGroups.length?_chatGroups.map(g=>`<button class="smart-chat-channel-card ${Number(g.id)===Number(_chatGroupId)?'active':''}" onclick="_openChatGroup(${Number(g.id)})"><span class="smart-chat-channel-icon">${g.group_type==='EVENT'?'📅':'📁'}</span><span><strong>${esc(g.name)}</strong><small>${esc(g.group_type)} · ${esc(g.status)}${Number(g.unread_count)>0?' · '+esc(g.unread_count)+' '+t('chat.unread'):''}</small></span><b>›</b></button>`).join(''):`<div class="smart-chat-list-empty-card"><div class="icon">🗂️</div><strong>${t('chat.noGroups')}</strong><small>${t('chat.noGroupsDescription')}</small></div>`;if(autoOpen&&_chatGroupId)await _openChatGroup(_chatGroupId);}catch(e){const box=document.getElementById('chatGroupList');if(box)box.innerHTML=`<div class="chat-error"><div>🗂️</div><div>${t('chat.loadGroupsFailed')}</div><button type="button" class="btn-secondary" onclick="_loadChatGroups(false)">${t('chat.retry')}</button></div>`;}}
window._newChatGroup=async function(){
 const host=document.getElementById('smartChatModeBody');if(!host)return;
 let staff=[];
 try{staff=await API.getDirectStaffDirectory();}catch(e){showToast(t('chat.groupCreateFailed'));return;}
 const choices=Array.isArray(staff)?staff.filter(x=>x?.teacher_id&&String(x.teacher_id)!==String(window.APP?.teacher_id)&&x.status!=='inactive'):[];
 const overlay=document.createElement('div');
 overlay.className='smart-chat-group-modal-overlay';
 overlay.innerHTML=`<section class="smart-chat-group-modal" role="dialog" aria-modal="true" aria-labelledby="chatGroupModalTitle">
   <header class="smart-chat-group-modal-head"><div><div class="smart-chat-kicker">${t('chat.groupChat')}</div><h2 id="chatGroupModalTitle">${t('chat.newGroup')}</h2><p>${t('chat.newGroupDescription')}</p></div><button type="button" class="smart-chat-group-modal-close" data-close-group-modal aria-label="${t('chat.cancel')}">×</button></header>
   <form id="chatGroupCreateForm" class="smart-chat-group-form">
     <label>${t('chat.groupNamePrompt')}<input name="groupName" maxlength="120" required autocomplete="off"></label>
     <label>${t('chat.groupTypePrompt')}<select name="groupType"><option value="PROJECT">PROJECT</option><option value="EVENT">EVENT</option></select></label>
     <label>${t('chat.groupDescriptionPrompt')}<textarea name="groupDescription" maxlength="1000" rows="3"></textarea></label>
     <fieldset class="smart-chat-group-member-field"><legend>${t('chat.groupMembersPrompt')}</legend>
       <div class="smart-chat-group-member-list">${choices.length?choices.map(x=>`<label class="smart-chat-group-member"><input type="checkbox" name="groupMember" value="${esc(String(x.teacher_id))}"><span><strong>${esc(x.teacher_name||t('chat.staff'))}</strong><small>${esc(String(x.teacher_id))}</small></span></label>`).join(''):`<p class="smart-chat-group-no-members">${t('chat.schoolMembersOnly')}</p>`}</div>
     </fieldset>
     <div class="smart-chat-group-date-grid"><label>${t('chat.startDatePrompt')}<input type="datetime-local" name="groupStartsAt"></label><label>${t('chat.endDatePrompt')}<input type="datetime-local" name="groupEndsAt"></label></div>
     <div class="smart-chat-group-form-actions"><button type="button" class="btn-secondary" data-close-group-modal>${t('chat.cancel')}</button><button type="submit" class="btn-primary" id="chatGroupCreateSubmit">${t('chat.newGroup')}</button></div>
   </form>
 </section>`;
 host.appendChild(overlay);
 const close=()=>overlay.remove();
 overlay.querySelectorAll('[data-close-group-modal]').forEach(btn=>btn.addEventListener('click',close));
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 overlay.querySelector('input[name="groupName"]')?.focus();
 const form=overlay.querySelector('#chatGroupCreateForm');
 form?.addEventListener('submit',async e=>{
   e.preventDefault();
   const fd=new FormData(form),name=String(fd.get('groupName')||'').trim(),desc=String(fd.get('groupDescription')||'').trim(),type=String(fd.get('groupType')||'PROJECT').toUpperCase();
   if(!name)return;
   if(!['PROJECT','EVENT'].includes(type)){showToast(t('chat.invalidGroupType'));return;}
   const memberIds=Array.from(form.querySelectorAll('input[name="groupMember"]:checked')).map(el=>el.value);
   const startsAt=String(fd.get('groupStartsAt')||'').trim()||null,endsAt=String(fd.get('groupEndsAt')||'').trim()||null;
   if(startsAt&&endsAt&&new Date(endsAt)<new Date(startsAt)){showToast(t('chat.groupCreateFailed'));return;}
   const submit=form.querySelector('#chatGroupCreateSubmit');if(submit){submit.disabled=true;submit.textContent=t('chat.loading');}
   const created=await _createChatGroup(name,desc,type,startsAt,endsAt,memberIds);
   if(created)close();else if(submit){submit.disabled=false;submit.textContent=t('chat.newGroup');}
 });
};
async function _createChatGroup(name,desc,type,startsAt=null,endsAt=null,memberIds=[]){
 try{const r=await API.createChatGroup(name,desc,type,startsAt,endsAt,memberIds);if(!r?.ok)throw new Error(r?.error||t('chat.createFailed'));_chatGroupId=Number(r.group_id);await _loadChatGroups();return true;}catch(e){showToast(t('chat.groupCreateFailed'));return false;}}
window._openChatGroup=async function(id){
 _chatGroupId=Number(id);const root=document.getElementById('chatGroupConversation');if(!root)return;
 root.innerHTML=`<div class="chat-stream" id="chatGroupStream"><div class="chat-empty-sub">${t('chat.loading')}</div></div>`;
 try{const r=await API.openChatGroup(_chatGroupId);if(!r?.ok)throw new Error(r?.error||t('chat.openFailed'));_chatGroupCurrent=r.group;const msgs=Array.isArray(r.messages)?r.messages:[];root.innerHTML=`<div class="smart-chat-conversation-head"><div class="smart-chat-direct-peer"><button type="button" class="smart-chat-mobile-back" onclick="_clearChatGroupSelection()" aria-label="${t('chat.backToGroups')}">‹</button><div><strong>${esc(r.group.name)}</strong><small>${esc(r.group.group_type)} · ${esc(r.group.status)}</small></div><span class="smart-chat-verified-pill">${t('chat.schoolMembersOnly')}</span></div><div class="chat-stream" id="chatGroupStream">${msgs.length?msgs.map(m=>`<div class="chat-bubble-row ${m.sender_teacher_id===window.APP?.teacher_id?'mine':'theirs'}"><div class="chat-bubble">${m.sender_teacher_id===window.APP?.teacher_id?'':`<div class="chat-bubble-author">${esc(m.sender_teacher_name)}</div>`}<div class="chat-bubble-text">${esc(m.body)}</div><div class="chat-bubble-time">${esc(new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</div></div></div>`).join(''):`<div class="chat-empty"><div class="chat-empty-icon">🗂️</div><div class="chat-empty-title">${t('chat.noMessages')}</div><div class="chat-empty-sub">${t('chat.startGroup')}</div></div>`}</div><form class="chat-composer" onsubmit="return _sendChatGroup(event)"><textarea id="chatGroupInput" rows="1" placeholder="${t('chat.writeMessage')}" oninput="_autoGrowChatInput(this)"></textarea><button class="chat-send-btn" type="submit">${_chatIcon('send')}</button></form>`;await API.markChatGroupRead(_chatGroupId);const g=_chatGroups.find(x=>Number(x.id)===_chatGroupId);if(g)g.unread_count=0;await _loadChatGroups(false); }catch(e){root.innerHTML=`<div class="chat-error"><div>🗂️</div><div>${t('chat.openGroupFailed')}</div><button type="button" class="btn-secondary" onclick="_openChatGroup(_chatGroupId)">${t('chat.retry')}</button></div>`;}}
window._setChatGroupMobileView=function(selected){const shell=document.querySelector('.smart-chat-group-shell');if(shell)shell.classList.toggle('has-selection',!!selected);};
window._clearChatGroupSelection=function(){_chatGroupId=null;_chatGroupCurrent=null;_setChatGroupMobileView(false);_renderGroupWorkspace();};
window._sendChatGroup=async function(ev){ev?.preventDefault?.();const input=document.getElementById('chatGroupInput'),v=input?.value.trim();if(!_chatGroupId||!v)return false;try{const r=await API.sendChatGroupMessage(_chatGroupId,v);if(!r?.ok)throw new Error(r?.error||t('chat.sendFailed'));input.value='';await _openChatGroup(_chatGroupId);}catch(e){showToast(t('chat.messageSendFailed'));}return false;};
window.renderChatGroups=_renderGroupWorkspace;