-- SCMS v12 — Harden direct-message reply authorization
-- Replies must reference a message in the same conversation and school.

create or replace function public.rpc_chat_direct_send(
  p_session_token text,
  p_conversation_id bigint,
  p_text text,
  p_reply_to_id bigint default null
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
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and t.school_id = s.school_id
     and t.role = s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  if p_text is null or length(btrim(p_text))=0 or length(p_text)>4000 then
    return jsonb_build_object('ok', false, 'error', 'bad_text');
  end if;

  if not exists (
    select 1 from public.staff_direct_members
     where conversation_id=p_conversation_id
       and school_id=v_sess.school_id
       and teacher_id=v_sess.teacher_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  if exists (
    select 1
      from public.staff_direct_members m
      join public.teachers t on t.teacher_id=m.teacher_id and t.school_id=v_sess.school_id
     where m.conversation_id=p_conversation_id
       and m.teacher_id<>v_sess.teacher_id
       and t.status<>'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'recipient_inactive');
  end if;

  if p_reply_to_id is not null and not exists (
    select 1
      from public.staff_direct_messages r
     where r.id=p_reply_to_id
       and r.conversation_id=p_conversation_id
       and r.school_id=v_sess.school_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_reply_target');
  end if;

  insert into public.staff_direct_messages(
    conversation_id, school_id, sender_teacher_id, sender_teacher_name, text, reply_to_id
  )
  values (
    p_conversation_id, v_sess.school_id, v_sess.teacher_id, v_sess.teacher_name, btrim(p_text), p_reply_to_id
  )
  returning * into v_row;

  update public.staff_direct_conversations
     set updated_at=now()
   where id=p_conversation_id and school_id=v_sess.school_id;

  return jsonb_build_object('ok', true, 'message', to_jsonb(v_row));
end
$function$;

revoke all on function public.rpc_chat_direct_send(text,bigint,text,bigint) from public;
grant execute on function public.rpc_chat_direct_send(text,bigint,text,bigint) to anon, authenticated;
