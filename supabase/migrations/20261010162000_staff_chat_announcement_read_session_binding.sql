-- SCMS v12 — bind announcement read receipts to the current teacher role.
-- A session must not remain usable after its teacher role changes.

create or replace function public.rpc_chat_announcement_mark_read(
  p_session_token text,
  p_announcement_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sess record;
  v_count int;
begin
  select t.teacher_id, t.school_id
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

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  update public.staff_announcement_recipients
     set read_at = coalesce(read_at, now())
   where announcement_id = p_announcement_id
     and teacher_id = v_sess.teacher_id
     and school_id = v_sess.school_id;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_recipient');
  end if;

  return jsonb_build_object('ok', true);
end
$function$;

revoke all on function public.rpc_chat_announcement_mark_read(text, uuid) from public;
grant execute on function public.rpc_chat_announcement_mark_read(text, uuid) to anon, authenticated;
