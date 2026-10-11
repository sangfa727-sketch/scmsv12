-- SCMS v12 — server-side gate for the School Website Studio.
-- This migration is a release artifact only. Do not apply to production without explicit approval.
-- The client-side gate is only for navigation/UX; future content writes must independently
-- authorize every operation on the server and must never rely on this result as a bearer capability.

create or replace function public.rpc_school_website_authorize(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_school_id text;
  v_role text;
begin
  if nullif(trim(p_session_token), '') is null then
    return jsonb_build_object('ok', false, 'authorized', false, 'error', 'access_denied');
  end if;

  select s.school_id, s.role
    into v_school_id, v_role
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_school_id is null then
    return jsonb_build_object('ok', false, 'authorized', false, 'error', 'access_denied');
  end if;

  if private.web_has_permission(p_session_token, 'website.manage', null, null) is distinct from true then
    return jsonb_build_object('ok', false, 'authorized', false, 'error', 'access_denied');
  end if;

  return jsonb_build_object(
    'ok', true,
    'authorized', true,
    'school_id', v_school_id,
    'role', v_role
  );
end;
$function$;

revoke all on function public.rpc_school_website_authorize(text) from public;
grant execute on function public.rpc_school_website_authorize(text) to anon, authenticated;
