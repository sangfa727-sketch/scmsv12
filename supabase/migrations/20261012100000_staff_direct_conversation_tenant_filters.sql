-- SCMS v12 — Keep Direct Chat conversation previews and unread counts tenant-scoped.
-- Malformed rows must not leak another school's peer identity, message preview, or unread count.

create or replace function public.rpc_chat_direct_conversations(p_session_token text)
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

  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_message_at desc nulls last), '[]'::jsonb)
    into v_rows
    from (
      select c.id as conversation_id,
             peer.teacher_id,
             peer.teacher_name,
             peer.role,
             peer.photo_url,
             peer.classes,
             lm.text as last_message,
             lm.created_at as last_message_at,
             coalesce(unread.unread_count, 0) as unread_count
        from public.staff_direct_conversations c
        join public.staff_direct_members me
          on me.conversation_id = c.id
         and me.teacher_id = v_sess.teacher_id
         and me.school_id = v_sess.school_id
        join public.staff_direct_members peer_member
          on peer_member.conversation_id = c.id
         and peer_member.school_id = v_sess.school_id
         and peer_member.teacher_id <> v_sess.teacher_id
        join public.teachers peer
          on peer.teacher_id = peer_member.teacher_id
         and peer.school_id = v_sess.school_id
         and peer.status = 'active'
        left join lateral (
          select m.text, m.created_at
            from public.staff_direct_messages m
           where m.conversation_id = c.id
             and m.school_id = v_sess.school_id
           order by m.created_at desc, m.id desc
           limit 1
        ) lm on true
        left join lateral (
          select count(*)::int as unread_count
            from public.staff_direct_messages m
           where m.conversation_id = c.id
             and m.school_id = v_sess.school_id
             and m.sender_teacher_id <> v_sess.teacher_id
             and (me.last_read_at is null or m.created_at > me.last_read_at)
        ) unread on true
       where c.school_id = v_sess.school_id
    ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end
$function$;

revoke all on function public.rpc_chat_direct_conversations(text) from public;
grant execute on function public.rpc_chat_direct_conversations(text) to anon, authenticated;
