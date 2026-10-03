create or replace function public.rpc_get_health_profile(p_session_token text, p_student_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_prof record;
  v_vaccs jsonb;
  v_visits jsonb;
begin
  if not private.web_has_permission(p_session_token, 'students.view', null, null) then
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

  if not exists (
    select 1
      from public.students
     where student_id = p_student_id
       and school_id = v_sess.school_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select blood_type, allergies, medical_conditions, medications,
         emergency_contact_name, emergency_contact_phone,
         emergency_contact_relation, doctor_name, doctor_phone, notes
    into v_prof
    from public.student_health_profiles
   where student_id = p_student_id
     and school_id = v_sess.school_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', i.id,
             'vaccine_name', i.vaccine_name,
             'dose_number', i.dose_number,
             'date_given', i.date_given,
             'notes', i.notes
           )
           order by i.date_given desc nulls last, i.id desc
         ), '[]'::jsonb)
    into v_vaccs
    from public.immunizations i
   where i.student_id = p_student_id
     and i.school_id = v_sess.school_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', h.id,
             'name_en', h.name_en,
             'class', h.class,
             'date', h.date,
             'reason', h.reason,
             'treatment', h.treatment,
             'notes', h.notes
           )
           order by h.date desc, h.id desc
         ), '[]'::jsonb)
    into v_visits
    from public.health_visits h
   where h.student_id = p_student_id
     and h.school_id = v_sess.school_id;

  return jsonb_build_object(
    'ok', true,
    'profile', coalesce(to_jsonb(v_prof), '{}'::jsonb),
    'vaccinations', v_vaccs,
    'visits', v_visits
  );
end;
$function$;