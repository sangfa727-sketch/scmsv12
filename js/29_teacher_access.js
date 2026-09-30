
'use strict';
function _taLang() {
  const lang = window.I18N?.current;
  return ['en','my','th','jp','km'].includes(lang) ? lang : 'en';
}

const _TA_UI = {
  en: {
    loading:'Loading…', manageTitle:'Manage Access', subtitle:'Set class, subject, and permission access for',
    classes:'Classes', subjects:'Subjects', permissions:'Permission Settings', permissionModes:'Default / Allow / Deny',
    selectClass:'Select class', selectSubject:'Select subject', add:'Add', closeButton:'Close',
    noClasses:'No class assignments yet.', noSubjects:'No subject assignments yet.',
    default:'Default', allowed:'Allow', denied:'Deny', defaultAllowed:'Allowed', defaultDenied:'Denied',
    permissionHelp:'Default permission follows the teacher role. For class/subject-specific access, select the relevant class and subject.',
    classRequired:'Please select a class first.', classSubjectRequired:'Please select a class and subject first.',
    saved:'Permission saved.', saveFailed:'Could not save permission.', classAddFailed:'Could not add class.',
    classRemoveFailed:'Could not remove class.', subjectAddFailed:'Could not add subject.',
    subjectRemoveFailed:'Could not remove subject.', loadFailed:'Could not load permission information.'
  },
  my: {
    loading:'တင်နေသည်…', manageTitle:'လုပ်ပိုင်ခွင့် စီမံရန်', subtitle:'အတွက် အတန်း၊ ဘာသာရပ်နှင့် လုပ်ပိုင်ခွင့် သတ်မှတ်ချက်များ',
    classes:'👥 အတန်းများ', subjects:'📚 ဘာသာရပ်များ', permissions:'🔐 လုပ်ပိုင်ခွင့် သတ်မှတ်ချက်များ', permissionModes:'မူလ / ခွင့်ပြု / ပိတ်ပင်',
    selectClass:'အတန်းရွေးပါ', selectSubject:'ဘာသာရပ်ရွေးပါ', add:'ထည့်မည်', closeButton:'ပိတ်မည်',
    noClasses:'အတန်းတာဝန်ပေးထားခြင်း မရှိသေးပါ။', noSubjects:'ဘာသာရပ်တာဝန်ပေးထားခြင်း မရှိသေးပါ။',
    default:'မူလ', allowed:'ခွင့်ပြု', denied:'ပိတ်ပင်', defaultAllowed:'ခွင့်ပြု', defaultDenied:'ပိတ်ပင်',
    permissionHelp:'မူလခွင့်ပြုချက်သည် ဆရာ/ဆရာမ၏ role အတိုင်းဖြစ်သည်။ အတန်း/ဘာသာရပ်အလိုက် ခွင့်ပြုချက်အတွက် သက်ဆိုင်ရာအတန်းနှင့် ဘာသာရပ်ကို ရွေးပါ။',
    classRequired:'အတန်းကို အရင်ရွေးပါ။', classSubjectRequired:'အတန်းနှင့် ဘာသာရပ်ကို အရင်ရွေးပါ။',
    saved:'လုပ်ပိုင်ခွင့် သိမ်းပြီးပါပြီ။', saveFailed:'လုပ်ပိုင်ခွင့် သိမ်း၍ မရပါ။', classAddFailed:'အတန်းထည့်၍ မရပါ။',
    classRemoveFailed:'အတန်းဖယ်၍ မရပါ။', subjectAddFailed:'ဘာသာရပ်ထည့်၍ မရပါ။',
    subjectRemoveFailed:'ဘာသာရပ်ဖယ်၍ မရပါ။', loadFailed:'လုပ်ပိုင်ခွင့် အချက်အလက် တင်မရပါ။'
  },
  th: {
    loading:'กำลังโหลด…', manageTitle:'จัดการสิทธิ์การเข้าถึง', subtitle:'กำหนดชั้นเรียน วิชา และสิทธิ์การเข้าถึงสำหรับ',
    classes:'👥 ชั้นเรียน', subjects:'📚 วิชา', permissions:'🔐 ตั้งค่าสิทธิ์', permissionModes:'ค่าเริ่มต้น / อนุญาต / ปฏิเสธ',
    selectClass:'เลือกชั้นเรียน', selectSubject:'เลือกวิชา', add:'เพิ่ม', closeButton:'ปิด',
    noClasses:'ยังไม่มีชั้นเรียนที่ได้รับมอบหมาย', noSubjects:'ยังไม่มีวิชาที่ได้รับมอบหมาย',
    default:'ค่าเริ่มต้น', allowed:'อนุญาต', denied:'ปฏิเสธ', defaultAllowed:'อนุญาต', defaultDenied:'ปฏิเสธ',
    permissionHelp:'สิทธิ์เริ่มต้นจะอิงตามบทบาทของครู สำหรับสิทธิ์เฉพาะชั้นเรียนหรือวิชา ให้เลือกชั้นเรียนและวิชาที่เกี่ยวข้อง',
    classRequired:'กรุณาเลือกชั้นเรียนก่อน', classSubjectRequired:'กรุณาเลือกชั้นเรียนและวิชาก่อน',
    saved:'บันทึกสิทธิ์แล้ว', saveFailed:'ไม่สามารถบันทึกสิทธิ์ได้', classAddFailed:'ไม่สามารถเพิ่มชั้นเรียนได้',
    classRemoveFailed:'ไม่สามารถลบชั้นเรียนได้', subjectAddFailed:'ไม่สามารถเพิ่มวิชาได้',
    subjectRemoveFailed:'ไม่สามารถลบวิชาได้', loadFailed:'ไม่สามารถโหลดข้อมูลสิทธิ์ได้'
  },
  jp: {
    loading:'読み込み中…', manageTitle:'アクセス管理', subtitle:'クラス・科目・権限を設定：',
    classes:'👥 クラス', subjects:'📚 科目', permissions:'🔐 権限設定', permissionModes:'既定 / 許可 / 拒否',
    selectClass:'クラスを選択', selectSubject:'科目を選択', add:'追加', closeButton:'閉じる',
    noClasses:'割り当てられたクラスはありません。', noSubjects:'割り当てられた科目はありません。',
    default:'既定', allowed:'許可', denied:'拒否', defaultAllowed:'許可', defaultDenied:'拒否',
    permissionHelp:'既定の権限は教師のロールに従います。クラス・科目ごとの権限を設定する場合は対象を選択してください。',
    classRequired:'先にクラスを選択してください。', classSubjectRequired:'先にクラスと科目を選択してください。',
    saved:'権限を保存しました。', saveFailed:'権限を保存できませんでした。', classAddFailed:'クラスを追加できませんでした。',
    classRemoveFailed:'クラスを削除できませんでした。', subjectAddFailed:'科目を追加できませんでした。', loadFailed:'権限情報を読み込めませんでした。'
  },
  km: {
    loading:'កំពុងផ្ទុក…', manageTitle:'គ្រប់គ្រងសិទ្ធិចូលប្រើ', subtitle:'កំណត់ថ្នាក់ មុខវិជ្ជា និងសិទ្ធិចូលប្រើសម្រាប់',
    classes:'👥 ថ្នាក់', subjects:'📚 មុខវិជ្ជា', permissions:'🔐 ការកំណត់សិទ្ធិ', permissionModes:'លំនាំដើម / អនុញ្ញាត / បដិសេធ',
    selectClass:'ជ្រើសរើសថ្នាក់', selectSubject:'ជ្រើសរើសមុខវិជ្ជា', add:'បន្ថែម', closeButton:'បិទ',
    noClasses:'មិនទាន់មានថ្នាក់ដែលបានចាត់តាំងទេ។', noSubjects:'មិនទាន់មានមុខវិជ្ជាដែលបានចាត់តាំងទេ។',
    default:'លំនាំដើម', allowed:'អនុញ្ញាត', denied:'បដិសេធ', defaultAllowed:'បានអនុញ្ញាត', defaultDenied:'បានបដិសេធ',
    permissionHelp:'សិទ្ធិលំនាំដើមអនុវត្តតាមតួនាទីគ្រូ។ សម្រាប់សិទ្ធិតាមថ្នាក់ ឬមុខវិជ្ជា សូមជ្រើសរើសថ្នាក់ និងមុខវិជ្ជាដែលពាក់ព័ន្ធ។',
    classRequired:'សូមជ្រើសរើសថ្នាក់ជាមុនសិន។', classSubjectRequired:'សូមជ្រើសរើសថ្នាក់ និងមុខវិជ្ជាជាមុនសិន។',
    saved:'បានរក្សាទុកសិទ្ធិ។', saveFailed:'មិនអាចរក្សាទុកសិទ្ធិបានទេ។', classAddFailed:'មិនអាចបន្ថែមថ្នាក់បានទេ។',
    classRemoveFailed:'មិនអាចដកថ្នាក់បានទេ។', subjectAddFailed:'មិនអាចបន្ថែមមុខវិជ្ជាបានទេ။',
    subjectRemoveFailed:'មិនអាចដកមុខវិជ្ជាបានទេ។', loadFailed:'មិនអាចផ្ទុកព័ត៌មានសិទ្ធិបានទេ។'
  }
};

function _taUi(key) {
  return (_TA_UI[_taLang()] || _TA_UI.en)[key] || _TA_UI.en[key] || key;
}
function _taText(key) {
  const dict = {
    en:{'dashboard.view':'View Dashboard','students.view':'View Students','students.edit':'Edit Student Information','leave.view':'View Leave Requests','leave.approve':'Approve / Reject Leave Requests','attendance.view':'View Attendance','attendance.edit':'Edit Attendance','homework.view':'View Homework','homework.create':'Create Homework','homework.edit':'Edit Homework','homework.delete':'Delete Homework','assessment.view':'View Assessments','assessment.create':'Create Assessments','assessment.edit':'Edit Assessments','assessment.delete':'Delete Assessments','billing.view':'View Billing','billing.write':'Edit Billing','teachers.view':'View Teachers','teachers.manage':'Manage Teachers','permissions.manage':'Manage Permissions'},
    my:{'dashboard.view':'Dashboard ကြည့်ရှုရန်','students.view':'ကျောင်းသားများ ကြည့်ရှုရန်','students.edit':'ကျောင်းသားအချက်အလက် ပြင်ဆင်ရန်','leave.view':'ခွင့်တောင်းစာ ကြည့်ရှုရန်','leave.approve':'ခွင့်တောင်းစာ အတည်ပြု/ပယ်ချရန်','attendance.view':'တက်ရောက်မှု ကြည့်ရှုရန်','attendance.edit':'တက်ရောက်မှု ပြင်ဆင်ရန်','homework.view':'အိမ်စာ ကြည့်ရှုရန်','homework.create':'အိမ်စာ ထည့်သွင်းရန်','homework.edit':'အိမ်စာ ပြင်ဆင်ရန်','homework.delete':'အိမ်စာ ဖျက်ရန်','assessment.view':'အကဲဖြတ်ချက် ကြည့်ရှုရန်','assessment.create':'အကဲဖြတ်ချက် ထည့်သွင်းရန်','assessment.edit':'အကဲဖြတ်ချက် ပြင်ဆင်ရန်','assessment.delete':'အကဲဖြတ်ချက် ဖျက်ရန်','billing.view':'ငွေစာရင်း ကြည့်ရှုရန်','billing.write':'ငွေစာရင်း ပြင်ဆင်ရန်','teachers.view':'ဆရာ/ဆရာမများ ကြည့်ရှုရန်','teachers.manage':'ဆရာ/ဆရာမများ စီမံရန်','permissions.manage':'လုပ်ပိုင်ခွင့်များ စီမံရန်'},
    th:{'dashboard.view':'ดูแดชบอร์ด','students.view':'ดูนักเรียน','students.edit':'แก้ไขข้อมูลนักเรียน','leave.view':'ดูคำขอลา','leave.approve':'อนุมัติ / ปฏิเสธคำขอลา','attendance.view':'ดูการเข้าเรียน','attendance.edit':'แก้ไขการเข้าเรียน','homework.view':'ดูการบ้าน','homework.create':'สร้างการบ้าน','homework.edit':'แก้ไขการบ้าน','homework.delete':'ลบการบ้าน','assessment.view':'ดูการประเมิน','assessment.create':'สร้างการประเมิน','assessment.edit':'แก้ไขการประเมิน','assessment.delete':'ลบการประเมิน','billing.view':'ดูการเรียกเก็บเงิน','billing.write':'แก้ไขการเรียกเก็บเงิน','teachers.view':'ดูครู','teachers.manage':'จัดการครู','permissions.manage':'จัดการสิทธิ์'},
    jp:{'dashboard.view':'ダッシュボードを見る','students.view':'生徒を見る','students.edit':'生徒情報を編集','leave.view':'休暇申請を見る','leave.approve':'休暇申請を承認 / 却下','attendance.view':'出欠を見る','attendance.edit':'出欠を編集','homework.view':'宿題を見る','homework.create':'宿題を作成','homework.edit':'宿題を編集','homework.delete':'宿題を削除','assessment.view':'評価を見る','assessment.create':'評価を作成','assessment.edit':'評価を編集','assessment.delete':'評価を削除','billing.view':'請求を見る','billing.write':'請求を編集','teachers.view':'教師を見る','teachers.manage':'教師を管理','permissions.manage':'権限を管理'},
    km:{'dashboard.view':'ផ្ទាំងគ្រប់គ្រង','students.view':'មើលសិស្ស','students.edit':'កែសម្រួលព័ត៌មានសិស្ស','leave.view':'មើលសំណើសុំច្បាប់ឈប់','leave.approve':'អនុម័ត / បដិសេធសំណើសុំច្បាប់ឈប់','attendance.view':'មើលវត្តមាន','attendance.edit':'កែសម្រួលវត្តមាន','homework.view':'មើលកិច្ចការផ្ទះ','homework.create':'បង្កើតកិច្ចការផ្ទះ','homework.edit':'កែសម្រួលកិច្ចការផ្ទះ','homework.delete':'លុបកិច្ចការផ្ទះ','assessment.view':'មើលការវាយតម្លៃ','assessment.create':'បង្កើតការវាយតម្លៃ','assessment.edit':'កែសម្រួលការវាយតម្លៃ','assessment.delete':'លុបការវាយតម្លៃ','billing.view':'មើលវិក្កយបត្រ','billing.write':'កែសម្រួលវិក្កយបត្រ','teachers.view':'មើលគ្រូ','teachers.manage':'គ្រប់គ្រងគ្រូ','permissions.manage':'គ្រប់គ្រងសិទ្ធិ'}
  };
  return (dict[_taLang()]?.[key] || dict.en[key] || key);
}
function _taCategory(key) {
  const dict = {
    en:{dashboard:'Dashboard',students:'Students',leave:'Leave Requests',attendance:'Attendance',homework:'Homework',assessment:'Assessments',billing:'Billing',teachers:'Teachers',permissions:'Permissions'},
    my:{dashboard:'ပင်မစာမျက်နှာ',students:'ကျောင်းသားများ',leave:'ခွင့်တောင်းစာ',attendance:'တက်ရောက်မှု',homework:'အိမ်စာ',assessment:'အကဲဖြတ်ချက်',billing:'ငွေစာရင်း',teachers:'ဆရာ/ဆရာမများ',permissions:'လုပ်ပိုင်ခွင့်များ'},
    th:{dashboard:'แดชบอร์ด',students:'นักเรียน',leave:'คำขอลา',attendance:'การเข้าเรียน',homework:'การบ้าน',assessment:'การประเมิน',billing:'การเรียกเก็บเงิน',teachers:'ครู',permissions:'สิทธิ์'},
    jp:{dashboard:'ダッシュボード',students:'生徒',leave:'休暇申請',attendance:'出欠',homework:'宿題',assessment:'評価',billing:'請求',teachers:'教師',permissions:'権限'},
    km:{dashboard:'ផ្ទាំងគ្រប់គ្រង',students:'សិស្ស',leave:'សំណើសុំច្បាប់ឈប់',attendance:'វត្តមាន',homework:'កិច្ចការផ្ទះ',assessment:'ការវាយតម្លៃ',billing:'វិក្កយបត្រ',teachers:'គ្រូ',permissions:'សិទ្ធិ'}
  };
  return dict[_taLang()]?.[key] || dict.en[key] || key;
}
function _taDescription(key, fallback) { return _taText(key); }
function _taAssignmentTypeLabel(type) {
  const dict = {
    en:{class_teacher:'Class Teacher',assistant:'Assistant Teacher',subject_teacher:'Subject Teacher',other:'Other'},
    my:{class_teacher:'အတန်းပိုင်ဆရာ/ဆရာမ',assistant:'အကူဆရာ/ဆရာမ',subject_teacher:'ဘာသာရပ်ဆရာ/ဆရာမ',other:'အခြားတာဝန်'},
    th:{class_teacher:'ครูประจำชั้น',assistant:'ครูผู้ช่วย',subject_teacher:'ครูประจำวิชา',other:'อื่นๆ'},
    jp:{class_teacher:'担任',assistant:'補助教員',subject_teacher:'教科担当',other:'その他'}
  };
  return dict[_taLang()]?.[type] || dict.en[type] || type;
}

async function _teacherAccessRpc(action, teacherId, extra) {
  const sess = getWebSession();
  if (!sess?.session_token) throw new Error('AUTH_REQUIRED');
  return _webRpc('rpc_manage_teacher_access', Object.assign({
    p_session_token: sess.session_token,
    p_action: action,
    p_teacher_id: teacherId
  }, extra || {}));
}

/* Full four-language helper dictionaries are defined above. */

function _taOpt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function _taScopeControls(p, catalog) {
  if (p.scope_type !== 'class' && p.scope_type !== 'subject' && p.scope_type !== 'class_subject') return '';
  let h = '<div class="teacher-access-scope-controls">';
  if (p.scope_type === 'class' || p.scope_type === 'class_subject') {
    h += '<select class="form-input teacher-access-class" aria-label="' + esc(_taUi('selectClass')) + '"><option value="">'
      + _taUi('selectClass') + '</option>'
      + (catalog.classes || []).map(function(x){ return _taOpt(x,x,''); }).join('') + '</select>';
  }
  if (p.scope_type === 'subject' || p.scope_type === 'class_subject') {
    h += '<select class="form-input teacher-access-subject" aria-label="' + esc(_taUi('selectSubject')) + '"><option value="">'
      + _taUi('selectSubject') + '</option>'
      + (catalog.subjects || []).map(function(x){ return _taOpt(x.id, x.subject_name + (x.subject_code ? ' · ' + x.subject_code : ''), ''); }).join('') + '</select>';
  }
  return h + '</div>';
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
  root.innerHTML = '<div class="text-center text-muted">' + _taUi('loading') + '</div>';

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
      '</strong><span>' + esc(teacher.teacher_id || teacherId) + ' · ' + esc(teacher.role === 'admin' ? ({en:'Admin',my:'Admin',th:'ผู้ดูแล',jp:'管理者'}[_taLang()] || 'Admin') : (teacher.role === 'super_admin' ? ({en:'Super Admin',my:'Super Admin',th:'ผู้ดูแลระบบสูงสุด',jp:'スーパー管理者'}[_taLang()] || 'Super Admin') : ({en:'Teacher',my:'ဆရာ/ဆရာမ',th:'ครู',jp:'教師'}[_taLang()] || 'Teacher'))) + '</span></div>';

    html += '<section class="teacher-access-section">' +
      '<div class="teacher-access-section-head"><strong>' + _taUi('classes') + '</strong><span>' + classAssignments.length + '</span></div>' +
      '<div class="teacher-access-add-row"><select id="taClass" class="form-input"><option value="">' + _taUi('selectClass') + '</option>' +
      (catalog.classes || []).map(function(x){ return _taOpt(x,x,''); }).join('') +
      '</select><button class="btn-primary teacher-access-small" onclick="teacherAccessAddClass()">' + _taUi('add') + '</button></div>' +
      '<div class="teacher-access-chips">' +
      (classAssignments.length ? classAssignments.map(function(a){
        return '<span class="teacher-access-chip">' + esc(a.class_name) + ' · ' + esc(_taAssignmentTypeLabel(a.assignment_type)) +
          '<button type="button" onclick="teacherAccessRemoveClass(' + JSON.stringify(a.class_name) + ',' + JSON.stringify(a.assignment_type) + ')">×</button></span>';
      }).join('') : '<span class="text-muted">' + _taUi('noClasses') + '</span>') +
      '</div></section>';

    html += '<section class="teacher-access-section">' +
      '<div class="teacher-access-section-head"><strong>' + _taUi('subjects') + '</strong><span>' + subjectAssignments.length + '</span></div>' +
      '<div class="teacher-access-add-grid"><select id="taSubjectClass" class="form-input"><option value="">' + _taUi('selectClass') + '</option>' +
      (catalog.classes || []).map(function(x){ return _taOpt(x,x,''); }).join('') +
      '</select><select id="taSubject" class="form-input"><option value="">' + _taUi('selectSubject') + '</option>' +
      (catalog.subjects || []).map(function(x){ return _taOpt(x.id, x.subject_name + (x.subject_code ? ' · ' + x.subject_code : ''), ''); }).join('') +
      '</select><button class="btn-primary teacher-access-small" onclick="teacherAccessAddSubject()">' + _taUi('add') + '</button></div>' +
      '<div class="teacher-access-list">' +
      (subjectAssignments.length ? subjectAssignments.map(function(a){
        const s = (catalog.subjects || []).find(function(x){ return String(x.id) === String(a.subject_id); });
        return '<div class="teacher-access-item"><span>' + esc(a.class_name) + ' · ' + esc(s ? s.subject_name : ('#' + a.subject_id)) +
          '</span><button type="button" class="icon-btn-mini" onclick="teacherAccessRemoveSubject(' + JSON.stringify(a.class_name) + ',' + Number(a.subject_id) + ')">×</button></div>';
      }).join('') : '<span class="text-muted">' + _taUi('noSubjects') + '</span>') +
      '</div></section>';

    const groups = {};
    (catalog.permissions || []).forEach(function(p){ (groups[p.category] ||= []).push(p); });
    html += '<section class="teacher-access-section"><div class="teacher-access-section-head"><strong>' + _taUi('permissions') + '</strong><span>' + _taUi('permissionModes') + '</span></div>' +
      '<p class="form-help">' + _taUi('permissionHelp') + '</p><div class="teacher-access-permissions">';

    Object.keys(groups).forEach(function(category) {
      html += '<div class="teacher-access-perm-group"><div class="teacher-access-perm-category">' + esc(_taCategory(category)) + '</div>';
      groups[category].forEach(function(p) {
        const roleDefault = (roleDefaults.find(function(x){ return x.role === teacher.role && x.permission_key === p.permission_key; }) || {}).allowed;
        const override = p.scope_type === 'global' ? _taOverride(overrides,p.permission_key,p.scope_type,null,null) : null;
        const state = override ? (override.allowed ? 'allow' : 'deny') : 'default';
        html += '<div class="teacher-access-perm-row" data-permission="' + esc(p.permission_key) + '" data-scope="' + esc(p.scope_type) + '">' +
          '<div class="teacher-access-perm-copy"><strong>' + esc(_taText(p.permission_key)) + '</strong><small>' + esc(_taDescription(p.permission_key, p.description || '')) +
          '</small></div>' + _taScopeControls(p,catalog) +
          '<select class="teacher-access-perm-state" aria-label="' + _taUi('permissions') + '"><option value="default"' + (state === 'default' ? ' selected' : '') +
          '>' + _taUi('default') + (roleDefault ? ' (' + _taUi('allowed') + ')' : ' (' + _taUi('denied') + ')') + '</option><option value="allow"' + (state === 'allow' ? ' selected' : '') +
          '>' + _taUi('allowed') + '</option><option value="deny"' + (state === 'deny' ? ' selected' : '') + '>' + _taUi('denied') + '</option></select></div>';
      });
      html += '</div>';
    });
    html += '</div></section>';
    root.innerHTML = html;

    root.querySelectorAll('.teacher-access-perm-state').forEach(function(select) {
      select.addEventListener('change', function(){ teacherAccessSavePermission(select); });
    });
    root.querySelectorAll('.teacher-access-perm-row').forEach(function(row) {
      const state = row.querySelector('.teacher-access-perm-state');
      const refresh = function() {
        const scope = row.dataset.scope;
        const cls = row.querySelector('.teacher-access-class')?.value || null;
        const raw = row.querySelector('.teacher-access-subject')?.value || null;
        const subject = raw ? Number(raw) : null;
        const override = _taOverride(overrides, row.dataset.permission, scope, cls, subject);
        state.value = override ? (override.allowed ? 'allow' : 'deny') : 'default';
      };
      row.querySelectorAll('.teacher-access-class, .teacher-access-subject').forEach(function(sel) {
        sel.addEventListener('change', refresh);
      });
    });
  } catch (e) {
    root.innerHTML = '<div class="form-error">' + _taUi('loadFailed') + ' ' + esc(e?.message || String(e)) + '</div>';
  }
}

window.openTeacherAccess = async function(teacherId, teacherName) {
  /*
   * Do not paint the generic modal loading sheet.  The generic modal starts
   * with its own full-width/bottom-sheet animation, so showing "Loading…"
   * first makes Manage Access visibly flash as a horizontal card before the
   * real content replaces it.  Keep the shell hidden while the data loads,
   * then reveal the already-sized final sheet in one paint.
   */
  openModal('<div class="modal-sheet teacher-access-sheet teacher-access-preparing" onclick="event.stopPropagation()" style="visibility:hidden">' +
    '<div class="modal-handle"></div><h3 class="modal-title">' + _taUi('manageTitle') + '</h3>' +
    '<p class="modal-subtitle">' + esc(teacherName) + ' ' + _taUi('subtitle') + '</p>' +
    '<div id="teacherAccessRoot" data-teacher-id="' + esc(teacherId) + '"></div>' +
    '<button class="btn-secondary mt16" onclick="closeModal()">' + _taUi('closeButton') + '</button></div>');
  try {
    await _renderTeacherAccess();
  } finally {
    const sheet = document.querySelector('.teacher-access-sheet');
    if (sheet) {
      sheet.classList.remove('teacher-access-preparing');
      sheet.style.visibility = 'visible';
    }
  }
};

window.teacherAccessAddClass = async function() {
  const root = document.getElementById('teacherAccessRoot');
  const value = document.getElementById('taClass')?.value;
  if (!value) return showToast('' + _taUi('classRequired') + '');
  try { await _teacherAccessRpc('class_add', root.dataset.teacherId, {p_class_name:value,p_assignment_type:'class_teacher'}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || '' + _taUi('classAddFailed') + ''); }
};

window.teacherAccessRemoveClass = async function(className, assignmentType) {
  const root = document.getElementById('teacherAccessRoot');
  try { await _teacherAccessRpc('class_remove', root.dataset.teacherId, {p_class_name:className,p_assignment_type:assignmentType}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || '' + _taUi('classRemoveFailed') + ''); }
};

window.teacherAccessAddSubject = async function() {
  const root = document.getElementById('teacherAccessRoot');
  const cls = document.getElementById('taSubjectClass')?.value;
  const subject = Number(document.getElementById('taSubject')?.value);
  if (!cls || !subject) return showToast('' + _taUi('classSubjectRequired') + '');
  try { await _teacherAccessRpc('subject_add', root.dataset.teacherId, {p_class_name:cls,p_subject_id:subject}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || '' + _taUi('subjectAddFailed') + ''); }
};

window.teacherAccessRemoveSubject = async function(className, subjectId) {
  const root = document.getElementById('teacherAccessRoot');
  try { await _teacherAccessRpc('subject_remove', root.dataset.teacherId, {p_class_name:className,p_subject_id:Number(subjectId)}); await _renderTeacherAccess(); }
  catch(e){ showToast(e?.message || '' + _taUi('subjectRemoveFailed') + ''); }
};

window.teacherAccessSavePermission = async function(select) {
  const root = document.getElementById('teacherAccessRoot');
  const row = select.closest('.teacher-access-perm-row');
  const key = row.dataset.permission;
  const scope = row.dataset.scope;
  const cls = row.querySelector('.teacher-access-class')?.value || null;
  const subjectRaw = row.querySelector('.teacher-access-subject')?.value || null;
  const subject = subjectRaw ? Number(subjectRaw) : null;
  if ((scope === 'class' || scope === 'class_subject') && !cls) { showToast('' + _taUi('classRequired') + ''); select.value='default'; return; }
  if ((scope === 'subject' || scope === 'class_subject') && !subject) { showToast(_taUi('classSubjectRequired')); select.value='default'; return; }
  try {
    if (select.value === 'default') {
      await _teacherAccessRpc('permission_remove', root.dataset.teacherId, {p_permission_key:key,p_scope_type:scope,p_class_name:cls,p_subject_id:subject});
    } else {
      await _teacherAccessRpc('permission_set', root.dataset.teacherId, {p_permission_key:key,p_allowed:select.value === 'allow',p_scope_type:scope,p_class_name:cls,p_subject_id:subject});
    }
    showToast('' + _taUi('saved') + '');
  } catch(e) { showToast(e?.message || '' + _taUi('saveFailed') + ''); }
};
