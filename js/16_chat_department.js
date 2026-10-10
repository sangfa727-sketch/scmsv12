/* SCMS v12 — Department Chat workspace */
'use strict';
let _departmentRows=[],_departmentId=null,_departmentMessages=[],_departmentPollTimer=null,_departmentOpenRequest=0;
function _renderDepartmentWorkspace(){
  return _chatChannelBack(t('chat.schoolChat')) + `
<div class="smart-chat-list-title">${t('chat.departmentGrade')} <span style="float:right"><button type="button" class="btn-pill-action" disabled>${t('chat.workspace.department')}</button> <button type="button" class="btn-pill-action" onclick="_showGradeWorkspace()">${t('chat.workspace.grade')}</button></span></div>
<div class="smart-chat-direct-shell smart-chat-department-shell${_departmentId ? " has-selection" : ""}">
<aside class="smart-chat-direct-list"><div class="smart-chat-direct-list-head"><div><div class="smart-chat-kicker">${t('chat.workspace.department').toUpperCase()}</div><strong>${t('chat.workspace.department')}</strong></div><div class="smart-chat-list-actions">${window.APP?.is_admin ? `<button type="button" class="smart-chat-add-btn" id="departmentComposerToggle" onclick="_toggleDepartmentComposer()" aria-expanded="false" title="${t('chat.newDepartment')}">+</button>` : ''}<button type="button" class="smart-chat-refresh-btn" onclick="_loadDepartmentWorkspace()" title="${t('chat.refresh')}" aria-label="${t('chat.refresh')}">↻</button></div></div>
<div class="smart-chat-directory-title">${t('chat.departmentOnlyAssigned')}</div><div id="departmentList" class="smart-chat-conversation-list"></div></aside>
<section class="smart-chat-direct-conversation" style="display:flex"><div id="departmentHead" class="smart-chat-conversation-head"><div><strong>${t('chat.selectDepartmentBelong')}</strong><small>${t('chat.schoolIsolatedStaff')}</small></div><span class="smart-chat-verified-pill">${t('chat.authorizedMembers')}</span></div>
<div id="departmentMessageStream" class="chat-stream smart-chat-direct-stream"><div class="chat-empty"><div class="chat-empty-icon">📚</div><div class="chat-empty-title">${t('chat.workspace.department')}</div><div class="chat-empty-sub">${t('chat.selectDepartmentBelong')}</div></div></div>
<form class="chat-composer smart-chat-direct-composer" onsubmit="return _sendDepartmentFromComposer(event)"><textarea id="departmentChatInput" placeholder="${t('chat.selectDepartmentBelong')}..." rows="1" disabled></textarea><button type="submit" class="chat-send-btn" id="departmentSendBtn" disabled>${_chatIcon('send')}</button></form></section></div>`;
}
window._toggleDepartmentComposer=async function(){
  if(!window.APP?.is_admin)return;
  const current=document.getElementById('departmentComposerOverlay');
  if(current){current.remove();return;}
  let staff=[];
  try{staff=await API.getDirectStaffDirectory();}
  catch(e){showToast(t('chat.loadFailed'));return;}
  const choices=Array.isArray(staff)?staff.filter(x=>x?.teacher_id&&String(x.status||'active').toLowerCase()==='active'):[];
  const overlay=document.createElement('div');
  overlay.id='departmentComposerOverlay';
  overlay.className='smart-chat-group-modal-overlay smart-chat-department-modal-overlay';
  overlay.innerHTML=`<section class="smart-chat-group-modal" role="dialog" aria-modal="true" aria-labelledby="departmentModalTitle">
    <header class="smart-chat-group-modal-head"><div><div class="smart-chat-kicker">${t('chat.adminTools')}</div><h2 id="departmentModalTitle">${t('chat.newDepartment')}</h2><p>${t('chat.departmentOnlyAssigned')}</p></div><button type="button" class="smart-chat-group-modal-close" data-close-department-modal aria-label="${t('chat.cancel')}">×</button></header>
    <form id="departmentCreateForm" class="smart-chat-group-form">
      <label>${t('chat.departmentName')}<input id="departmentAdminName" name="departmentName" maxlength="120" required autocomplete="off"></label>
      <label>${t('chat.departmentCode')}<input id="departmentAdminCode" name="departmentCode" maxlength="50" required autocomplete="off"></label>
      <fieldset class="smart-chat-group-member-field"><legend>${t('chat.groupMembersPrompt')}</legend>
        <div class="smart-chat-group-member-list">${choices.length?choices.map(x=>`<label class="smart-chat-group-member"><input type="checkbox" name="departmentMember" value="${esc(String(x.teacher_id))}"><span><strong>${esc(x.teacher_name||x.name||t('chat.staff'))}</strong><small>${esc(x.role||t('chat.teacher'))}</small></span></label>`).join(''):`<p class="smart-chat-group-no-members">${t('chat.schoolMembersOnly')}</p>`}</div>
      </fieldset>
      <p class="smart-chat-modal-hint">${t('chat.schoolMembersOnly')}</p>
      <div class="smart-chat-group-form-actions"><button type="button" class="btn-secondary" data-close-department-modal>${t('chat.cancel')}</button><button type="submit" class="btn-primary" id="departmentCreateSubmit">${t('chat.createDepartment')}</button></div>
    </form>
  </section>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelectorAll('[data-close-department-modal]').forEach(button=>button.addEventListener('click',close));
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  const nameInput=overlay.querySelector('#departmentAdminName');
  const codeInput=overlay.querySelector('#departmentAdminCode');
  if(codeInput)codeInput.dataset.autoGenerated='true';
  nameInput?.addEventListener('input',()=>{
    if(!codeInput||codeInput.dataset.autoGenerated!=='true')return;
    const generated=String(nameInput.value||'').normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,50);
    codeInput.value=generated;
  });
  codeInput?.addEventListener('input',()=>{codeInput.dataset.autoGenerated='false';});
  overlay.querySelector('#departmentCreateForm')?.addEventListener('submit',adminCreateDepartment);
  nameInput?.focus();
};
window.adminCreateDepartment=async function(event){
  event?.preventDefault?.();
  if(!window.APP?.is_admin||!window.API?.adminUpsertDepartment||!window.API?.adminSetDepartmentMembers)return false;
  const overlay=document.getElementById('departmentComposerOverlay');
  const form=overlay?.querySelector('#departmentCreateForm');
  const code=String(form?.querySelector('#departmentAdminCode')?.value||'').trim().toUpperCase();
  const name=String(form?.querySelector('#departmentAdminName')?.value||'').trim();
  const teacherIds=Array.from(form?.querySelectorAll('input[name="departmentMember"]:checked')||[]).map(input=>String(input.value));
  if(!code){showToast(t('chat.departmentCodeRequired'));return false;}
  if(!name){showToast(t('chat.departmentNameRequired'));return false;}
  if(!teacherIds.length){showToast(t('chat.selectTeacher'));return false;}
  const button=form?.querySelector('#departmentCreateSubmit');
  if(button){button.disabled=true;button.textContent=t('chat.loading');}
  try{
    const result=await API.adminUpsertDepartment(code,name,true);
    if(!result?.ok||!result.department_id)throw new Error(result?.error||'create_failed');
    const membership=await API.adminSetDepartmentMembers(result.department_id,teacherIds);
    if(!membership?.ok)throw new Error(membership?.error||'department_members_failed');
    overlay?.remove();
    showToast(t('chat.departmentCreated'));
    await _loadDepartmentWorkspace();
  }catch(e){
    showToast(t('chat.departmentCreateFailed'));
    if(button){button.disabled=false;button.textContent=t('chat.createDepartment');}
  }
  return false;
};
function _renderDepartmentList(){const box=document.getElementById('departmentList');if(!box)return;box.innerHTML=_departmentRows.length?_departmentRows.map(d=>`<button data-testid="department-row-${Number(d.id)}" class="smart-chat-channel-card ${Number(d.id)===Number(_departmentId)?'active':''}" onclick="_openDepartmentChat(${Number(d.id)})"><span class="smart-chat-channel-icon">📚</span><span><strong>${esc(d.department_name)}</strong><small>${esc(d.department_code)}</small></span><b>›</b></button>`).join(''):`<div class="smart-chat-list-empty-card"><div class="icon">📚</div><strong>${t('chat.noDepartmentAccess')}</strong><small>${t('chat.departmentAccess')}</small>${window.APP?.is_admin?`<details class="scms-setup-hint" style="margin-top:10px;text-align:left"><summary style="cursor:pointer;font-weight:600">! ${t('chat.setupWhy')}</summary><p style="margin:8px 0">${t('chat.setupDepartmentSteps')}</p><button type="button" class="btn-secondary" onclick="_toggleDepartmentComposer()">${t('chat.setupCreateDepartment')}</button></details>`:''}</div>`;}
async function _loadDepartmentWorkspace(){try{const b=document.getElementById('departmentList');if(b&&!_departmentRows.length)b.innerHTML=skeletonCards(2);const rows=await API.getDepartmentChats();_departmentRows=Array.isArray(rows)?rows:[];_renderDepartmentList();if(_departmentId&&_departmentRows.some(d=>Number(d.id)===Number(_departmentId)))await _openDepartmentChat(_departmentId);}catch(e){const b=document.getElementById('departmentList');if(b&&!_departmentRows.length)b.innerHTML=`<div class="chat-error"><div>📚</div><div>${t('chat.loadDepartmentsFailed')}</div><button type="button" class="btn-secondary" onclick="_loadDepartmentWorkspace()">${t('chat.retry')}</button></div>`;}}
function _startDepartmentPolling(){if(_departmentPollTimer)clearInterval(_departmentPollTimer);_departmentPollTimer=setInterval(()=>{if(document.getElementById('departmentMessageStream')&&_departmentId)_openDepartmentChat(_departmentId,true).catch(()=>{});},5000);}
async function _openDepartmentChat(id,silent=false){const nextId=Number(id);if(!Number.isFinite(nextId)||nextId<=0)return;const requestToken=++_departmentOpenRequest;const r=await API.openDepartmentChat(nextId).catch(()=>null);if(requestToken!==_departmentOpenRequest)return;if(!r?.ok){if(silent)return;if(_departmentPollTimer)clearInterval(_departmentPollTimer);_departmentPollTimer=null;_departmentId=null;_departmentMessages=[];_setDepartmentMobileView(false);const h=document.getElementById('departmentHead'),s=document.getElementById('departmentMessageStream');if(h)h.innerHTML='<div class="smart-chat-direct-peer"><div><strong>'+t('chat.selectDepartmentBelong')+'</strong><small>'+t('chat.departmentAccess')+'</small></div></div>';if(s)s.innerHTML='<div class="chat-empty"><div class="chat-empty-icon">📚</div><div class="chat-empty-title">'+t('chat.selectDepartmentBelong')+'</div><div class="chat-empty-sub">'+t('chat.departmentAccess')+'</div></div>';const i=document.getElementById('departmentChatInput'),b=document.getElementById('departmentSendBtn');if(i)i.disabled=true;if(b)b.disabled=true;_renderDepartmentList();if(!silent)showToast(t('chat.departmentUnauthorized'));return;} const incoming=Array.isArray(r.rows)?r.rows:[];if(silent&&Number(_departmentId)===nextId&&JSON.stringify(incoming)===JSON.stringify(_departmentMessages))return;_departmentId=nextId;_setDepartmentMobileView(true);_renderDepartmentList();const h=document.getElementById('departmentHead'),s=document.getElementById('departmentMessageStream'),i=document.getElementById('departmentChatInput'),b=document.getElementById('departmentSendBtn');if(h)h.innerHTML=`<div class="smart-chat-direct-peer"><button type="button" class="smart-chat-mobile-back" onclick="_clearDepartmentSelection()" aria-label="${t('chat.backToDepartments')}">‹</button><div><strong>${esc(r.department?.department_name||t('chat.workspace.department'))}</strong><small>${esc(r.department?.department_code||'')} · ${t('chat.staffOnlyConversation')}</small></div></div><span class="smart-chat-verified-pill">${t('chat.schoolIsolated')}</span>`;_departmentMessages=incoming;if(s){const rows=[..._departmentMessages].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));s.innerHTML=rows.length?rows.map(m=>{const mine=m.sender_teacher_id===window.APP?.teacher_id;const when=m.created_at?new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';return `<div class="chat-bubble-row ${mine?'mine':'theirs'}">${mine?'':`<div class="chat-bubble-avatar">${esc((m.sender_teacher_name||'?')[0])}</div>`}<div class="chat-bubble"><div class="chat-bubble-author">${mine?t('chat.you'):esc(m.sender_teacher_name||t('chat.staff'))}</div><div class="chat-bubble-text">${esc(m.body||'')}</div><div class="chat-bubble-time">${esc(when)}</div></div></div>`;}).join(''):`<div class="chat-empty"><div class="chat-empty-icon">📚</div><div class="chat-empty-title">${t('chat.noMessages')}</div><div class="chat-empty-sub">${t('chat.startDepartment')}</div></div>`;requestAnimationFrame(()=>{s.scrollTop=s.scrollHeight;});}if(i){i.disabled=false;i.placeholder=t('chat.writeDepartmentMessage');}if(b)b.disabled=false;await API.markDepartmentRead(_departmentId);if(!silent)_startDepartmentPolling();}
window._sendDepartmentFromComposer=async function(ev){ev?.preventDefault?.();const i=document.getElementById('departmentChatInput'),b=document.getElementById('departmentSendBtn'),body=i?.value.trim();if(!_departmentId||!body||!b)return false;b.disabled=true;i.disabled=true;try{const r=await API.sendDepartmentMessage(_departmentId,body);if(!r?.ok)throw new Error(r?.error||'Send failed');i.value='';i.style.height='auto';await _openDepartmentChat(_departmentId);}catch(e){showToast(t('chat.departmentSendFailed'));}finally{b.disabled=false;i.disabled=false;i.focus();}return false;};
window._setDepartmentMobileView=function(selected){const shell=document.querySelector('.smart-chat-department-shell');if(shell)shell.classList.toggle('has-selection',!!selected);};
window._clearDepartmentSelection=function(){_departmentOpenRequest++;if(_departmentPollTimer)clearInterval(_departmentPollTimer);_departmentPollTimer=null;_departmentId=null;_departmentMessages=[];_setDepartmentMobileView(false);_renderChatMode();};
window._invalidateDepartmentChatOpen=function(){_departmentOpenRequest++;};
window._loadDepartmentWorkspace=_loadDepartmentWorkspace;window._openDepartmentChat=_openDepartmentChat;