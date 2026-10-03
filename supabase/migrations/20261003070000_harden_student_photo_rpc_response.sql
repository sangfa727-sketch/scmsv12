create or replace function public.rpc_set_student_photo(p_session_token text, p_student_id text, p_photo_url text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_row record;
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

  if not private.web_has_permission(
    p_session_token,
    'students.edit',
    null,
    null
  ) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_student_id is null or trim(p_student_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'student_id_required');
  end if;

  update public.students
     set photo_url = p_photo_url,
         updated_at = now()
   where student_id = p_student_id
     and school_id = v_sess.school_id
  returning * into v_row;

  if v_row is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'student_id', v_row.student_id,
      'name_en', v_row.name_en,
      'name_local', v_row.name_local,
      'class', v_row.class,
      'status', v_row.status,
      'photo_url', v_row.photo_url
    )
  );
end;
$function$;
