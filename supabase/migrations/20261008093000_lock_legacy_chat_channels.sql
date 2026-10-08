-- SCMS v12 — Lock legacy school chat RPCs to the only live channel.
-- Prevent arbitrary channel probing or legacy admin-channel writes until
-- dedicated server-authorized routes exist for those channel types.

create or replace function public.rpc_get_chat_messages(
  p_session_token text,
  p_channel text default 'staff',
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.school_id, s.teacher_id, s.role
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

  if p_channel <> 'staff' then
    return jsonb_build_object('ok', false, 'error', 'unsupported_channel');
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.created_at),
    '[]'::jsonb
  )
    into v_rows
    from (
      select *
        from public.chat_messages
       where school_id = v_sess.school_id
         and channel = 'staff'
       order by created_at desc
       limit least(greatest(coalesce(p_limit,50),1),200)
    ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end
$function$;

create or replace function public.rpc_send_chat_message(
  p_session_token text,
  p_channel text,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sess record;
  v_row record;
begin
  select s.school_id, s.teacher_id, s.role, t.teacher_name
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

  if p_channel <> 'staff' then
    return jsonb_build_object('ok', false, 'error', 'unsupported_channel');
  end if;

  if p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'bad_text');
  end if;

  insert into public.chat_messages(
    school_id, channel, teacher_id, teacher_name, text
  )
  values (
    v_sess.school_id, 'staff', v_sess.teacher_id, v_sess.teacher_name, btrim(p_text)
  )
  returning * into v_row;

  return jsonb_build_object('ok', true, 'message', to_jsonb(v_row));
end
$function$;

revoke all on function public.rpc_get_chat_messages(text,text,integer) from public;
revoke all on function public.rpc_send_chat_message(text,text,text) from public;
grant execute on function public.rpc_get_chat_messages(text,text,integer) to anon, authenticated;
grant execute on function public.rpc_send_chat_message(text,text,text) to anon, authenticated;
