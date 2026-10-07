-- Security hardening: require daily_report.view for daily report reads.
-- Keep the change isolated from the broader incident hardening migration.

INSERT INTO public.permission_definitions(permission_key, scope_type, is_active)
VALUES ('daily_report.view', 'class', true)
ON CONFLICT(permission_key) DO UPDATE
SET scope_type = EXCLUDED.scope_type,
    is_active = EXCLUDED.is_active;

INSERT INTO public.role_permissions(role, permission_key, allowed)
SELECT r.role, 'daily_report.view', true
FROM (VALUES
  ('teacher'),
  ('assistant_teacher'),
  ('senior_teacher'),
  ('school_coordinator'),
  ('administrative_assistant'),
  ('admin'),
  ('super_admin')
) AS r(role)
ON CONFLICT(role, permission_key) DO UPDATE
SET allowed = EXCLUDED.allowed;

CREATE OR REPLACE FUNCTION public.rpc_get_daily_reports(
  p_session_token text,
  p_days_back integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sess record;
  v_rows jsonb;
  v_days integer;
begin
  select s.school_id
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  v_days := least(greatest(coalesce(p_days_back, 7), 0), 365);

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.date desc, x.name_en),
    '[]'::jsonb
  )
    into v_rows
    from (
      select *
        from public.daily_reports
       where school_id = v_sess.school_id
         and date >= current_date - (v_days || ' days')::interval
         and private.web_has_permission(
               p_session_token,
               'daily_report.view',
               nullif(trim(class), ''),
               null
             )
    ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_get_daily_reports(text, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_daily_reports(text, integer)
TO anon, authenticated;
