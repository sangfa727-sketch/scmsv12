-- Security fix: enforce assignment-scoped student reads in the legacy multi-table RPC.
-- Browser clients must not use a global students.view permission to read every student.
CREATE OR REPLACE FUNCTION public.rpc_get_my_data(
  p_session_token text,
  p_table text,
  p_days_back integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sess record;
  v_since date;
  v_result jsonb;
begin
  select s.teacher_id, s.school_id
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id and t.school_id = s.school_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  if p_table = 'students' and not private.web_has_permission(p_session_token, 'students.view') then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_table in ('attendance','homework_log','daily_reports','incidents','parent_comms','timetable','subjects','terms') then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_days_back is not null then
    v_since := current_date - p_days_back;
  end if;

  if p_table = 'students' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.class, x.name_en), '[]'::jsonb) into v_result
      from (
        select *
        from public.students
        where school_id = v_sess.school_id
          and status = 'Active'
          and private.web_has_student_class_permission(p_session_token, 'students.view', class)
      ) x;
  elsif p_table = 'attendance' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.date desc, x.class), '[]'::jsonb) into v_result
      from (select * from public.attendance where school_id = v_sess.school_id and (v_since is null or date >= v_since)) x;
  elsif p_table = 'daily_reports' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.date desc), '[]'::jsonb) into v_result
      from (select * from public.daily_reports where school_id = v_sess.school_id and (v_since is null or date >= v_since)) x;
  elsif p_table = 'homework_log' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.date desc), '[]'::jsonb) into v_result
      from (select * from public.homework_log where school_id = v_sess.school_id and (v_since is null or date >= v_since)) x;
  elsif p_table = 'incidents' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.date desc), '[]'::jsonb) into v_result
      from (select * from public.incidents where school_id = v_sess.school_id and (v_since is null or date >= v_since)) x;
  elsif p_table = 'parent_comms' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.date desc), '[]'::jsonb) into v_result
      from (select * from public.parent_comms where school_id = v_sess.school_id and (v_since is null or date >= v_since)) x;
  elsif p_table = 'timetable' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.day, x.period), '[]'::jsonb) into v_result
      from (select * from public.timetable where school_id = v_sess.school_id) x;
  elsif p_table = 'subjects' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.display_order), '[]'::jsonb) into v_result
      from (select * from public.subjects where school_id = v_sess.school_id and is_active = true) x;
  elsif p_table = 'terms' then
    select coalesce(jsonb_agg(row_to_json(x) order by x.term_order), '[]'::jsonb) into v_result
      from (select * from public.terms where school_id = v_sess.school_id) x;
  else
    return jsonb_build_object('ok', false, 'error', 'unknown_table');
  end if;

  return jsonb_build_object('ok', true, 'rows', v_result);
end;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_get_my_data'
      AND pg_get_functiondef(p.oid) ~ 'private\.web_has_student_class_permission'
  ) THEN
    RAISE EXCEPTION 'rpc_get_my_data student class-scope contract missing';
  END IF;
END $$;