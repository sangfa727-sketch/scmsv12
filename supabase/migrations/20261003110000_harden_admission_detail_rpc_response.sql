create or replace function public.rpc_get_admission_detail(p_session_token text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_row record;
begin
  if not private.web_has_permission(p_session_token, 'admissions.view', null, null) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  select s.teacher_id, s.school_id into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  select * into v_row from public.admissions
   where id = p_id and school_id = v_sess.school_id;

  if v_row is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'admission', jsonb_build_object(
      'id', v_row.id,
      'applicant_name_en', v_row.applicant_name_en,
      'applicant_name_local', v_row.applicant_name_local,
      'date_of_birth', v_row.date_of_birth,
      'gender', v_row.gender,
      'desired_class', v_row.desired_class,
      'parent_name', v_row.parent_name,
      'parent_phone', v_row.parent_phone,
      'parent_email', v_row.parent_email,
      'application_date', v_row.application_date,
      'status', v_row.status,
      'interview_date', v_row.interview_date,
      'source', v_row.source,
      'notes', v_row.notes,
      'converted_student_id', v_row.converted_student_id,
      'applicant_photo_url', v_row.applicant_photo_url,
      'registration_invoice_id', v_row.registration_invoice_id
    )
  );
end
$function$;
