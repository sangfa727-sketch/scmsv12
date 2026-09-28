
'use strict';

async function _teacherAccessRpc(action, teacherId, extra) {
  const sess = getWebSession();
  if (!sess?.session_token) throw new Error('AUTH_REQUIRED');
  return _webRpc('rpc_manage_teacher_access', Object.assign({
    p_session_token: sess.session_token,
    p_action: action,
    p_teacher_id: teacherId
  }, extra || {}));
}

function _taText(key) {
  const map = {
    'dashboard.view':'Dashboard ကြည့်ရှုရန်',
    'students.view':'ကျောင်းသားများ ကြည့်ရှုရန်',
    'students.edit':'ကျောင်းသားအချက်အလက် ပြင်ဆင်ရန်',
    'leave.view':'ခွင့်တောင်းစာ ကြည့်ရှုရန်',
    'leave.approve':'ခွင့်တောင်းစာ အတည်ပြု/ပယ်ချရန်',
    'attendance.view':'တက်ရောက်မှု ကြည့်ရှုရန်',
    'attendance.edit':'တက်ရောက်မှု ပြင်ဆင်ရန်',
    'homework.view':'အိမ်စာ ကြည့်ရှုရန်',
    'homework.create':'အိမ်စာ ထည့်သွင်းရန်',
    'homework.edit':'အိမ်စာ ပြင်ဆင်ရန်',
    'homework.delete':'အိမ်စာ ဖျက်ရန်',
    'assessment.view':'အကဲဖြတ်ချက် ကြည့်ရှုရန်',
    'assessment.create':'အကဲဖြတ်ချက် ထည့်သွင်းရန်',
    'assessment.edit':'အကဲဖြတ်ချက် ပြင်ဆင်ရန်',
    'assessment.delete':'အကဲဖြတ်ချက် ဖျက်ရန်',
    'billing.view':'ငွေစာရင်း ကြည့်ရှုရန်',
    'billing.write':'ငွေစာရင်း ပြင်ဆင်ရန်',
    'teachers.view':'ဆရာ/ဆရာမများ ကြည့်ရှုရန်',
    'teachers.manage':'ဆရာ/ဆရာမများ စီမံရန်',
    'permissions.manage':'လုပ်ပိုင်ခွင့်များ စီမံရန်'
  };
  return map[key] || key;
}
function _taCategory(key) {
  const map = { dashboard:'ပင်မစာမျက်နှာ', students:'ကျောင်းသားများ', leave:'ခွင့်တောင်းစာ', attendance:'တက်ရောက်မှု', homework:'အိမ်စာ', assessment:'အကဲဖြတ်ချက်', billing:'ငွေစာရင်း', teachers:'ဆရာ/ဆရာမများ', permissions:'လုပ်ပိုင်ခွင့်များ' };
  return map[key] || key;
}
function _taDescription(key, fallback) {
  return _taText(key);
}

function _taOpt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function _taScopeControls(p, catalog) {
  let h = '';
  if (p.scope_type === 'class' || p.scope_type === 'class_subject') {
    h += '<select class="form-input teacher-access-class" aria-label="Class"><option value="">Class</option>' +
      (catalog.classes || []).map(function(x){ return _taOpt(x,x,''); }).join('') + '</select>';
  }
  if (p.scope_type === 'subject' || p.scope_type === 'class_subject') {
    h += '<select class="form-input teacher-access-subject" aria-label="Subject"><option value="">Subject</option>' +
      (catalog.subjects || []).map(function(x){ return _taOpt(x.id, x.subject_name + (x.subject_code ? ' · ' + x.subject_code : ''), ''); }).join('') + '</select>';
  }
  return h;
}

function _taOverride(overrides, key, scope, cls, subject) {
  return (overrides || []).find(function(x) {
    return x.permission_key === key && x.scope_type === scope &&
      (scope === 'global' ||
       (scope === 'class' && x.class_name === cls) ||
       (scope === 'subject' && String(x.subject_id) === String(subject)) ||
       (scope === 'class_subject' && x.class_name === cls && String(x.subject_id) === String(subject)));
  });
}

async function _renderTeacherAccess() {
  const root = document.getElementById('teacherAccessRoot');
  if (!root) return;
  const teacherId = root.dataset.teacherId;
  root.innerHTML = '<div class="text-center text-muted">Loading…</div>';

  try {
    const results = await Promise.all([
      _teacherAccessRpc('catalog', teacherId),
      _teacherAccessRpc('list', teacherId)
    ]);
    const catalog = results[0] || {};
    const data = results[1] || {};
    const teacher = data.teacher || {};
    const classAssignments = (data.classes || []).filter(function(x){ return x.is_active; });
    const subjectAssignments = (data.subjects || []).filter(function(x){ return x.is_active; });
    const overrides = data.permissions || [];
    const roleDefaults = catalog.role_permissions || [];

    let html = '<div class="teacher-access-head"><strong>' + esc(teacher.teacher_name || '') +
      '</strong><span>' + esc(teacher.teacher_id || teacherId) + ' · ' + esc(teacher.role || '') + '</span></div>';

    html += '<section class="teacher-access-section">' +
      '<div class="teacher-access-section-head"><strong>👥 Classes</strong><span>' + classAssignments.length + '</span></div>' +
      '<div class="teacher-access-add-row"><select id="taClass" class="form-input"><option value="">Select class</option>' +
      (catalog.classes || []).map(function(x){ return _taOpt(x,x,''); }).join('') +
      '</select><button class="btn-primary teacher-access-small" onclick="teacherAccessAddClass()">Add</button></div>' +
      '<div class="teacher-access-chips">' +
      (classAssignments.length ? classAssignments.map(function(a){
        return '<span class="teacher-access-chip">' + esc(a.class_name) + ' · ' + esc(a.assignment_type) +
          '<button type="button" onclick="teacherAccessRemoveClass(' + JSON.stringify(a.class_name) + ',' + JSON.stringify(a.assignment_type) + ')">×</button></span>';
      }).join('') : '<span class="text-muted">No class assignments yet.</span>') +
      '</div></section>';

    html += '<section class="teacher-access-section">' +
      '<div class="teacher-access-section-head"><strong>📚 Subjects</strong><span>' + subjectAssignments.length + '</span></div>' +
      '<div class="teacher-access-add-grid"><select id="taSubjectClass" class="form-input"><option value="">Class</option>' +
      (catalog.classes || []).map(function(x){ return _taOpt(x,x,''); }).join('') +
      '</select><select id="taSubject" class="form-input"><option value="">Subject</option>' +
      (catalog.subjects || []).map(function(x){ return _taOpt(x.id, x.subject_name + (x.subject_code ? ' · ' + x.subject_code : ''), ''); }).join('') +
      '</select><button class="btn-primary teacher-access-small" onclick="teacherAccessAddSubject()">Add</button></div>' +
      '<div class="teacher-access-list">' +
      (subjectAssignments.length ? subjectAssignments.map(function(a){
        const s = (catalog.subjects || []).find(function(x){ return String(x.id) === String(a.subject_id); });
        return '<div class="teacher-access-item"><span>' + esc(a.class_name) + ' · ' + esc(s ? s.subject_name : ('#' + a.subject_id)) +
          '</span><button type="button" class="icon-btn-mini" onclick="teacherAccessRemoveSubject(' + JSON.stringify(a.class_name) + ',' + Number(a.subject_id) + ')">×</button></div>';
      }).join('') : '<span class="text-muted">No subject assignments yet.</span>') +
      '</div></section>';

    const groups = {};
    (catalog.permissions || []).forEach(function(p){ (groups[p.category] ||= []).push(p); });
    html += '<section class="teacher-access-section"><div class="teacher-access-section-head"><strong>🔐 Permission overrides</strong><span>Default / Allow / Deny</span></div>' +
      '<p class="form-help">Default follows the teacher role. Scoped permissions need a class/subject context.</p><div class="teacher-access-permissions">';

    Object.keys(groups).forEach(function(category) {
      html += '<div class="teacher-access-perm-group"><div class="teacher-access-perm-category">' + esc(_taCategory(category)) + '</div>';
      groups[category].forEach(function(p) {
        const roleDefault = (roleDefaults.find(function(x){ return x.role === teacher.role && x.permission_key === p.permission_key; }) || {}).allowed;
        const override = p.scope_type === 'global' ? _taOverride(overrides,p.permission_key,p.scope_type,null,null) : null;
        const state = override ? (override.allowed ? 'allow' : 'deny') : 'default';
        html += '<div class="teacher-access-perm-row" data-permission="' + esc(p.permission_key) + '" data-scope="' + esc(p.scope_type) + '">' +
          '<div class="teacher-access-perm-copy"><strong>' + esc(_taText(p.permission_key)) + '</strong><small>' + esc(_taDescription(p.permission_key, p.description || '')) +
          '</small></div>' + _taScopeControls(p,catalog) +
          '<select class="teacher-access-perm-state" aria-label="Permission state"><option value="default"' + (state === 'default' ? ' selected' : '') +
          '>Default' + (roleDefault ? ' (ခွင့်ပြု)' : ' (ပိတ်ပင်)') + '</option><option value="allow"' + (state === 'allow' ? ' selected' : '') +
          '>Allow</option><option value="deny"' + (state === 'deny' ? ' selected' : '') + '>Deny</option></select></div>';
      });
      html += '</div>';
    });
    html += '</div></section>';
    root.innerHTML = html;

    root.querySelectorAll('.teacher-access-perm-state').forEach(function(select) {
      select.addEventListener('change', function(){ teacherAccessSavePermission(select); });
    });
  } catch (e) {
    root.innerHTML = '<div class="form-error">Failed to load access settings: ' + esc(e?.message || String(e)) + '</div>';
  }
}

window.openTeacherAccess = async function(teacherId, teacherName) {
  openModal('<div class="modal-sheet teacher-access-sheet" onclick="event.stopPropagation()">' +
    '<div class="modal-handle"></div><h3 class="modal-title">🔐 Manage access</h3>' +
    '<p class="modal-subtitle">Classes, subjects and permission overrides for ' + esc(teacherName) + '</p>' +
    '<div id="teacherAccessRoot" data-teacher-id="' + esc(teacherId) + '"><div class="text-center text-muted">Loading…</div></div>' +
    '<button class="btn-secondary mt16" onclick="closeModal()">Close</button></div>');
  await _renderTeacherAccess();
};

window.teacherAccessAddClass = async function() {
  const root = document.getElementById('teacherAccessRoot');
  const value = document.getElementById('taClass')?.value;
  if (!value) return showToast('Select a class first.');
  try { await _teacherAccessRpc('class_add', root.dataset.teacherId, {p_class_name:value,p_assignment_type:'class_teacher'}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || 'Could not add class.'); }
};

window.teacherAccessRemoveClass = async function(className, assignmentType) {
  const root = document.getElementById('teacherAccessRoot');
  try { await _teacherAccessRpc('class_remove', root.dataset.teacherId, {p_class_name:className,p_assignment_type:assignmentType}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || 'Could not remove class.'); }
};

window.teacherAccessAddSubject = async function() {
  const root = document.getElementById('teacherAccessRoot');
  const cls = document.getElementById('taSubjectClass')?.value;
  const subject = Number(document.getElementById('taSubject')?.value);
  if (!cls || !subject) return showToast('Select class and subject first.');
  try { await _teacherAccessRpc('subject_add', root.dataset.teacherId, {p_class_name:cls,p_subject_id:subject}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || 'Could not add subject.'); }
};

window.teacherAccessRemoveSubject = async function(className, subjectId) {
  const root = document.getElementById('teacherAccessRoot');
  try { await _teacherAccessRpc('subject_remove', root.dataset.teacherId, {p_class_name:className,p_subject_id:Number(subjectId)}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || 'Could not remove subject.'); }
};

window.teacherAccessSavePermission = async function(select) {
  const root = document.getElementById('teacherAccessRoot');
  const row = select.closest('.teacher-access-perm-row');
  const key = row.dataset.permission;
  const scope = row.dataset.scope;
  const cls = row.querySelector('.teacher-access-class')?.value || null;
  const subjectRaw = row.querySelector('.teacher-access-subject')?.value || null;
  const subject = subjectRaw ? Number(subjectRaw) : null;
  if ((scope === 'class' || scope === 'class_subject') && !cls) { showToast('Select a class first.'); select.value='default'; return; }
  if ((scope === 'subject' || scope === 'class_subject') && !subject) { showToast('Select a subject first.'); select.value='default'; return; }
  try {
    if (select.value === 'default') {
      await _teacherAccessRpc('permission_remove', root.dataset.teacherId, {p_permission_key:key,p_scope_type:scope,p_class_name:cls,p_subject_id:subject});
    } else {
      await _teacherAccessRpc('permission_set', root.dataset.teacherId, {p_permission_key:key,p_allowed:select.value === 'allow',p_scope_type:scope,p_class_name:cls,p_subject_id:subject});
    }
    showToast('Permission saved.');
  } catch(e) { showToast(e?.message || 'Could not save permission.'); }
};
