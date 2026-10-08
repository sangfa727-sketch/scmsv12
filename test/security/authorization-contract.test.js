  const migration = read('supabase/migrations/20261008190000_staff_grade_chat.sql');
  const api = read('js/02L_api_chat.js');
  const grade = read('js/16_chat_grade.js');
  for (const table of ['staff_grade_messages','staff_grade_read_state']) assert.match(migration, new RegExp('create table if not exists public\\.' + table));
  for (const fn of ['rpc_chat_grade_list','rpc_chat_grade_open','rpc_chat_grade_send','rpc_chat_grade_mark_read']) {
    assert.match(migration, new RegExp('function public\\.' + fn));
    assert.match(migration, new RegExp(fn + '[\\s\\S]{0,5000}p_session_token text'));
    assert.match(migration, new RegExp(fn + '[\\s\\S]{0,5000}expires_at>now\\(\\)'));
    assert.match(migration, new RegExp(fn + '[\\s\\S]{0,7000}school_id=v_school_id'));
    assert.match(migration, new RegExp(fn + '[\\s\\S]{0,8000}teacher_class_assignments'));
  }
  assert.match(migration, /alter table public\.staff_grade_messages enable row level security/);
  assert.match(migration, /alter table public\.staff_grade_messages force row level security/);
  assert.match(migration, /alter table public\.staff_grade_read_state force row level security/);
  for (const table of ['staff_grade_messages','staff_grade_read_state']) {
    assert.match(migration, new RegExp('revoke all on public\\\\.' + table + ' from anon, authenticated'));
  }
  for (const fn of ['rpc_chat_grade_list','rpc_chat_grade_open','rpc_chat_grade_send','rpc_chat_grade_mark_read']) {
    assert.match(migration, new RegExp('revoke all on function public\\\\.' + fn));
    assert.match(migration, new RegExp('grant execute on function public\\\\.' + fn));
  }
  assert.match(migration, /unauthorized_grade/);
  assert.match(migration, /last_read_at/);
  for (const fn of ['getGradeChats','openGradeChat','sendGradeMessage','markGradeRead']) assert.match(api, new RegExp(fn));
  assert.match(grade, /API\.getGradeChats/);
  assert.match(grade, /API\.sendGradeMessage/);
  assert.match(grade, /API\.markGradeRead/);
});

test('Official announcement workspace reads only through guarded announcement APIs', () => {
  const api = read('js/02L_api_chat.js');
  const workspace = read('js/16_chat_announcements.js');
  assert.match(api, /getStaffAnnouncements/);
  assert.match(api, /markStaffAnnouncementRead/);
  assert.match(workspace, /API\.getStaffAnnouncements/);
  assert.match(workspace, /API\.markStaffAnnouncementRead/);
  assert.match(workspace, /Official Announcements/);
});