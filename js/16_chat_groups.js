'use strict';
let _chatGroups=[],_chatGroupId=null,_chatGroupCurrent=null;
function _renderGroupWorkspace(){
 const root=document.getElementById('smartChatModeBody'); if(!root)return;
 root.innerHTML=_chatChannelBack('School Chat') + `<div class="smart-chat-direct-shell smart-chat-group-shell${_chatGroupId ? ' has-selection' : ''}"><aside class="smart-chat-direct-list"><div class="smart-chat-direct-list-head"><div><div class="smart-chat-kicker">GROUP CHAT</div><strong>Project / Event Groups</strong></div><button type="button" class="smart-chat-refresh-btn" onclick="_loadChatGroups(false)" title="${t('chat.groups.refresh')}">↻</button></div><button class="smart-chat-channel-card" onclick="_newChatGroup()"><span class="smart-chat-channel-icon">＋</span><span><strong>New group</strong><small>Create a temporary project or event group</small></span><b>›</b></button><div id="chatGroupList"></div></aside><section class="smart-chat-direct-conversation" id="chatGroupConversation"><div class="chat-empty"><div class="chat-empty-icon">🗂️</div><div class="chat-empty-title">Select a group</div><div class="chat-empty-sub">Project and event conversations stay inside your school.</div></div></section></div>`;
 _loadChatGroups();
}
async function _loadChatGroups(autoOpen=true){
 try{const box=document.getElementById('chatGroupList');if(box)box.innerHTML=skeletonCards(2);_chatGroups=await API.getChatGroups();if(box)box.innerHTML=_chatGroups.length?_chatGroups.map(g=>`<button class="smart-chat-channel-card ${Number(g.id)===Number(_chatGroupId)?'active':''}" onclick="_openChatGroup(${Number(g.id)})"><span class="smart-chat-channel-icon">${g.group_type==='EVENT'?'📅':'📁'}</span><span><strong>${esc(g.name)}</strong><small>${esc(g.group_type)} · ${esc(g.status)}${Number(g.unread_count)>0?' · '+esc(g.unread_count)+' unread':''}</small></span><b>›</b></button>`).join(''):'<div class="smart-chat-list-empty-card"><div class="icon">🗂️</div><strong>No groups yet</strong><small>Project or event groups created for your school will appear here.</small></div>';if(autoOpen&&_chatGroupId)await _openChatGroup(_chatGroupId);}catch(e){const box=document.getElementById('chatGroupList');if(box)box.innerHTML='<div class="chat-error"><div>🗂️</div><div>Unable to load groups.</div><button type="button" class="btn-secondary" onclick="_loadChatGroups(false)">Retry</button></div>';}}
window._newChatGroup=async function(){
 const name=prompt('Group name');if(!name?.trim())return;
 const type=(prompt('Type: PROJECT or EVENT','PROJECT')||'PROJECT').toUpperCase();
 if(!['PROJECT','EVENT'].includes(type)){showToast('Invalid group type.');return;}
 const desc=prompt('Description (optional)')||'';
 let staff=[];try{staff=await API.getDirectStaffDirectory();}catch(e){staff=[];}
 const choices=Array.isArray(staff)?staff.filter(x=>x?.teacher_id&&x.teacher_id!==window.APP?.teacher_id&&x.status!=='inactive'):[];
 const roster=choices.map(x=>`${x.teacher_id} — ${x.teacher_name||'Staff'}`).join('\n');
 const rawMembers=choices.length?prompt(`Add members by teacher ID, comma-separated.\n\n${roster}`,''):'';
 const memberIds=(rawMembers||'').split(',').map(x=>x.trim()).filter(Boolean);
 const startsRaw=prompt('Start date/time (optional, ISO format e.g. 2026-10-10T09:00)')||'';
 const endsRaw=prompt('End date/time (optional, ISO format e.g. 2026-10-10T17:00)')||'';
 const startsAt=startsRaw.trim()||null,endsAt=endsRaw.trim()||null;
 _createChatGroup(name.trim(),desc,type,startsAt,endsAt,memberIds);
};
async function _createChatGroup(name,desc,type,startsAt=null,endsAt=null,memberIds=[]){
 try{const r=await API.createChatGroup(name,desc,type,startsAt,endsAt,memberIds);if(!r?.ok)throw new Error(r?.error||t('chat.groups.createFailed'));_chatGroupId=Number(r.group_id);await _loadChatGroups();}catch(e){showToast('Group could not be created.');}}
window._openChatGroup=async function(id){
 _chatGroupId=Number(id);const root=document.getElementById('chatGroupConversation');if(!root)return;
 root.innerHTML='<div class="chat-stream" id="chatGroupStream"><div class="chat-empty-sub">Loading…</div></div>';
 try{const r=await API.openChatGroup(_chatGroupId);if(!r?.ok)throw new Error(r?.error||'Open failed');_chatGroupCurrent=r.group;const msgs=Array.isArray(r.messages)?r.messages:[];root.innerHTML=`<div class="smart-chat-conversation-head"><div class="smart-chat-direct-peer"><button type="button" class="smart-chat-mobile-back" onclick="_clearChatGroupSelection()" aria-label="Back to groups">‹</button><div><strong>${esc(r.group.name)}</strong><small>${esc(r.group.group_type)} · ${esc(r.group.status)}</small></div><span class="smart-chat-verified-pill">School members only</span></div><div class="chat-stream" id="chatGroupStream">${msgs.length?msgs.map(m=>`<div class="chat-bubble-row ${m.sender_teacher_id===window.APP?.teacher_id?'mine':'theirs'}"><div class="chat-bubble">${m.sender_teacher_id===window.APP?.teacher_id?'':`<div class="chat-bubble-author">${esc(m.sender_teacher_name)}</div>`}<div class="chat-bubble-text">${esc(m.body)}</div><div class="chat-bubble-time">${esc(new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</div></div></div>`).join(''):'<div class="chat-empty"><div class="chat-empty-icon">🗂️</div><div class="chat-empty-title">No messages yet</div><div class="chat-empty-sub">Start the group conversation.</div></div>'}</div><form class="chat-composer" onsubmit="return _sendChatGroup(event)"><textarea id="chatGroupInput" rows="1" placeholder="${t('chat.groups.placeholder')}" oninput="_autoGrowChatInput(this)"></textarea><button class="chat-send-btn" type="submit">${_chatIcon('send')}</button></form>`;await API.markChatGroupRead(_chatGroupId);const g=_chatGroups.find(x=>Number(x.id)===_chatGroupId);if(g)g.unread_count=0;await _loadChatGroups(false); }catch(e){root.innerHTML='<div class="chat-error"><div>🗂️</div><div>Unable to open this group.</div><button type="button" class="btn-secondary" onclick="_openChatGroup(_chatGroupId)">Retry</button></div>';}}
window._setChatGroupMobileView=function(selected){const shell=document.querySelector('.smart-chat-group-shell');if(shell)shell.classList.toggle('has-selection',!!selected);};
window._clearChatGroupSelection=function(){_chatGroupId=null;_chatGroupCurrent=null;_setChatGroupMobileView(false);_renderGroupWorkspace();};
window._sendChatGroup=async function(ev){ev?.preventDefault?.();const input=document.getElementById('chatGroupInput'),v=input?.value.trim();if(!_chatGroupId||!v)return false;try{const r=await API.sendChatGroupMessage(_chatGroupId,v);if(!r?.ok)throw new Error(r?.error||t('chat.sendFailed'));input.value='';await _openChatGroup(_chatGroupId);}catch(e){showToast('Message could not be sent.');}return false;};
window.renderChatGroups=_renderGroupWorkspace;
