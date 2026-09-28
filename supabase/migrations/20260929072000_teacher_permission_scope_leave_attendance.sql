-- Step 4: Enforce teacher class scope on leave decisions and attendance writes.

create or replace function public.rpc_decide_leave_request(
  p_session_token text,
  p_id bigint,
  p_decision text,
  p_teacher_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sess record;
  v_req record;
  v_stud record;
  v_day date;
  v_marked int := 0;
begin
  select s.school_id, t.teacher_id, t.telegram_id
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  if p_decision not in ('Approved', 'Rejected') then
    return jsonb_build_object('ok', false, 'error', 'invalid_decision');
  end if;

  select * into v_req
    from public.leave_requests
   where id = p_id
     and school_id = v_sess.school_id;

  if v_req is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not private.web_has_permission(p_session_token, 'leave.approve', v_req.class, null) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if v_req.status <> 'Pending' then
    return jsonb_build_object('ok', false, 'error', 'already_decided');
  end if;

  update public.leave_requests
     set status = p_decision,
         decided_by = v_sess.teacher_id,
         decided_at = now(),
         teacher_note = p_teacher_note
   where id = p_id
     and school_id = v_sess.school_id
  returning * into v_req;

  if p_decision = 'Approved' then
    select * into v_stud
      from public.students
     where student_id = v_req.student_id
       and school_id = v_sess.school_id
     limit 1;

    if v_stud is null then
      return jsonb_build_object('ok', false, 'error', 'student_not_found');
    end if;

    v_day := v_req.start_date;
    while v_day <= v_req.end_date loop
      insert into public.attendance
        (date, day_of_week, student_id, name_en, class, status, note,
         teacher_id, school_id, timestamp, teacher_tg, created_at, updated_at)
      values
        (v_day, to_char(v_day, 'FMDay'), v_stud.student_id, v_stud.name_en,
         v_stud.class, 'L', coalesce(p_teacher_note, v_req.reason),
         v_sess.teacher_id, v_sess.school_id, now(), v_sess.telegram_id,
         now(), now())
      on conflict (date, student_id) do update
        set status = 'L',
            note = coalesce(p_teacher_note, v_req.reason),
            updated_at = now();

      v_marked := v_marked + 1;
      v_day := v_day + 1;
    end loop;
  end if;

  insert into public.audit_log(source, actor, action, school_id, payload)
  values ('web', v_sess.teacher_id, 'leave.decide', v_sess.school_id,
          jsonb_build_object('leave_request_id', p_id, 'decision', p_decision, 'class', v_req.class));

  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req), 'days_marked', v_marked);
end;
$$;

create or replace function public.rpc_save_attendance(
  p_session_token text,
  p_class text,
  p_date date,
  p_records jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sess record;
  v_count integer := 0;
  v_total integer := 0;
  v_distinct integer := 0;
  v_record jsonb;
  v_status text;
  v_note text;
begin
  select s.teacher_id, s.school_id, s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  if p_class is null or trim(p_class) = '' then
    return jsonb_build_object('ok', false, 'error', 'class_required');
  end if;

  if not private.web_has_permission(p_session_token, 'attendance.edit', trim(p_class), null) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_date is null then
    return jsonb_build_object('ok', false, 'error', 'date_required');
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'records_must_be_array');
  end if;

  v_total := jsonb_array_length(p_records);
  if v_total = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_records');
  end if;

  select count(*), count(distinct r->>'student_id')
    into v_count, v_distinct
    from jsonb_array_elements(p_records) r;

  if v_count <> v_distinct then
    return jsonb_build_object('ok', false, 'error', 'duplicate_student_records');
  end if;

  for v_record in select * from jsonb_array_elements(p_records)
  loop
    if jsonb_typeof(v_record) <> 'object'
       or nullif(trim(v_record->>'student_id'), '') is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_student_record');
    end if;

    v_status := upper(coalesce(nullif(trim(v_record->>'status'), ''), 'P'));
    if v_status not in ('P','A','L','T','S','E','H') then
      return jsonb_build_object('ok', false, 'error', 'invalid_attendance_status',
        'student_id', v_record->>'student_id');
    end if;

    v_note := nullif(trim(v_record->>'note'), '');
    if v_note is not null and char_length(v_note) > 200 then
      return jsonb_build_object('ok', false, 'error', 'attendance_note_too_long',
        'student_id', v_record->>'student_id');
    end if;

    if not exists (
      select 1 from public.students st
       where st.student_id = v_record->>'student_id'
         and st.school_id = v_sess.school_id
         and st.class = trim(p_class)
         and st.status = 'Active'
    ) then
      return jsonb_build_object('ok', false, 'error', 'student_not_in_class',
        'student_id', v_record->>'student_id');
    end if;
  end loop;

  delete from public.attendance
   where school_id = v_sess.school_id
     and class = trim(p_class)
     and date = p_date;

  insert into public.attendance (
    date, day_of_week, student_id, name_en, class, status, note,
    teacher_id, school_id, "timestamp"
  )
  select
    p_date, to_char(p_date, 'Dy'), r->>'student_id',
    (select st.name_en from public.students st
      where st.student_id = r->>'student_id'
        and st.school_id = v_sess.school_id),
    trim(p_class),
    upper(coalesce(nullif(trim(r->>'status'), ''), 'P')),
    nullif(trim(r->>'note'), ''),
    v_sess.teacher_id, v_sess.school_id, now()
  from jsonb_array_elements(p_records) as r;

  insert into public.audit_log(source, actor, action, school_id, payload)
  values ('web', v_sess.teacher_id, 'attendance.save', v_sess.school_id,
          jsonb_build_object('class', trim(p_class), 'date', p_date, 'records_count', v_total));

  return jsonb_build_object('ok', true, 'count', v_total, 'class', trim(p_class), 'date', p_date);
end;
$$;
