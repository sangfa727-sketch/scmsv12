/* SCMS v12 — verified Grade Channel UI */
'use strict';
(function(){
  function grades(){
    var a=window.APP||{}, rows=a.teacherDirectory||a.teachers||a.staff||[], me=rows.find(function(t){return t&&t.teacher_id===a.teacher_id;});
    var raw=me&&me.classes, out=Array.isArray(raw)?raw:String(raw||'').split(/[,|]/);
    if(a.is_admin) rows.forEach(function(t){var r=Array.isArray(t&&t.classes)?t.classes:String((t&&t.classes)||'').split(/[,|]/);r.forEach(function(x){x=String(x||'').trim();if(x&&!out.includes(x))out.push(x);});});
    return Array.from(new Set(out.map(function(x){return String(x||'').trim();}).filter(Boolean))).slice(0,30);
  }
  async function load(grade){
    if(!grade)return;
    try{
      var rows=await API.getGradeMessages(grade), s=document.getElementById('gradeChatStream');
      if(!s)return;
      if(!rows.length){s.innerHTML='<div class="chat-empty"><div class="chat-empty-icon">📚</div><div class="chat-empty-title">No messages yet</div><div class="chat-empty-sub">Start the verified grade conversation.</div></div>';return;}
      var me=window.APP&&window.APP.teacher_id;
      s.innerHTML=rows.map(function(m){var mine=m.sender_teacher_id===me,t=m.created_at?new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';return '<div class="chat-bubble-row '+(mine?'mine':'theirs')+'">'+(mine?'':'<div class="chat-bubble-avatar">'+esc((m.sender_teacher_name||'?')[0])+'</div>')+'<div class="chat-bubble"><div class="chat-bubble-author">'+(mine?'You':esc(m.sender_teacher_name||'Staff'))+'</div><div class="chat-bubble-text">'+esc(m.text||'')+'</div><div class="chat-bubble-time">'+esc(t)+'</div></div></div>';}).join('');
      requestAnimationFrame(function(){s.scrollTop=s.scrollHeight;}); API.markGradeRead(grade).catch(function(){});
    }catch(e){var s=document.getElementById('gradeChatStream');if(s)s.innerHTML='<div class="chat-error"><div>💬</div><div>Unable to load grade channel.</div><button class="btn-secondary" onclick="loadGradeChannel(document.getElementById(\'gradeChannelSelect\').value)">Retry</button></div>';}
  }
  function render(){
    var root=document.getElementById('smartChatModeBody'), gs=grades(); if(!root)return;
    var opts=gs.map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join('');
    root.innerHTML='<div class="smart-chat-school-grid"><aside class="smart-chat-channel-list"><div class="smart-chat-list-title">School Chat</div><button class="smart-chat-channel-card" onclick="switchChatChannel(\'staff\')"><span class="smart-chat-channel-icon">👥</span><span><strong>All Staff</strong><small>General staff conversation</small></span><b>›</b></button><button class="smart-chat-channel-card active"><span class="smart-chat-channel-icon">📚</span><span><strong>Department &amp; Grade</strong><small>Verified grade channels</small></span><b>›</b></button></aside><section class="smart-chat-conversation"><div class="smart-chat-conversation-head"><div><strong>Grade Channel</strong><small>Only assigned teachers can read or send.</small></div><span class="smart-chat-verified-pill">Server authorized</span></div><div style="padding:10px 12px;border-bottom:1px solid var(--border)"><label style="display:block;font-size:11px;font-weight:700">Grade<select id="gradeChannelSelect" style="width:100%;margin-top:5px;padding:9px;border-radius:9px;background:var(--bg2);color:var(--text);border:1px solid var(--border)">'+opts+'</select></label></div><div class="chat-stream" id="gradeChatStream"></div><form class="chat-composer" onsubmit="return sendGradeChat(event)"><textarea id="gradeChatInput" placeholder="Write to this grade..." rows="1" '+(gs.length?'':'disabled')+' oninput="_autoGrowChatInput(this)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendGradeChat(event)}"></textarea><button type="submit" class="chat-send-btn" id="gradeChatSendBtn" '+(gs.length?'':'disabled')+'>'+_chatIcon('send')+'</button></form></section></div>';
    var sel=document.getElementById('gradeChannelSelect'); if(sel){sel.onchange=function(){load(sel.value);};load(sel.value);}
    stopChatPolling(); window.__gradeChatTimer=setInterval(function(){load(document.getElementById('gradeChannelSelect')&&document.getElementById('gradeChannelSelect').value);},5000);
    if(!gs.length)document.getElementById('gradeChatStream').innerHTML='<div class="chat-empty"><div class="chat-empty-title">No assigned grade</div><div class="chat-empty-sub">Your account has no verified active grade assignment.</div></div>';
  }
  window.loadGradeChannel=load;
  window.sendGradeChat=async function(ev){
    if(ev&&ev.preventDefault)ev.preventDefault();
    var grade=document.getElementById('gradeChannelSelect')&&document.getElementById('gradeChannelSelect').value,input=document.getElementById('gradeChatInput'),btn=document.getElementById('gradeChatSendBtn'),v=input&&input.value.trim();
    if(!grade||!v||!btn)return false;btn.disabled=true;input.disabled=true;
    try{var r=await API.sendGradeMessage(grade,v);if(!r||!r.ok)throw new Error(r&&r.error||'send_failed');input.value='';input.style.height='auto';await load(grade);}
    catch(e){showToast(e&&e.message==='not_assigned'?'You are not assigned to this grade.':'Grade message could not be sent.');}
    finally{btn.disabled=false;input.disabled=false;input.focus();}return false;
  };
  window.switchChatChannel=function(channel){
    if(window.__gradeChatTimer){clearInterval(window.__gradeChatTimer);window.__gradeChatTimer=null;}
    if(channel==='departments'){window._chatChannel='departments';render();return;}
    window._chatChannel=channel; if(typeof _renderChatMode==='function')_renderChatMode();
  };
})();