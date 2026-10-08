-- Fix explicit unassignment semantics for inquiry tickets
create or replace function public.rpc_chat_inquiry_update(p_session_token text,p_ticket_id bigint,p_status text default null,p_assigned_teacher_id text default null) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v record; v_ticket record; v_assignee record;
begin
  select s.school_id,s.teacher_id,t.teacher_name,t.role into v
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id
  where s.session_token=p_session_token and s.expires_at>now()
    and t.status='active' and t.school_id=s.school_id and t.role=s.role limit 1;
  if v is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if v.role not in ('admin','super_admin') then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if p_status is not null and p_status not in ('OPEN','ASSIGNED','IN_PROGRESS','WAITING','RESOLVED','CLOSED') then return jsonb_build_object('ok',false,'error','bad_status'); end if;
  select * into v_ticket from public.staff_inquiry_tickets t where t.id=p_ticket_id and t.school_id=v.school_id;
  if v_ticket is null then return jsonb_build_object('ok',false,'error','ticket_forbidden'); end if;
  if p_assigned_teacher_id is not null then
    select teacher_id,teacher_name into v_assignee from public.teachers
    where teacher_id=p_assigned_teacher_id and school_id=v.school_id and status='active' limit 1;
    if v_assignee is null then return jsonb_build_object('ok',false,'error','assignee_forbidden'); end if;
  end if;
  update public.staff_inquiry_tickets
  set assigned_teacher_id=p_assigned_teacher_id,status=coalesce(p_status,status),updated_at=now(),
      resolved_at=case when p_status='RESOLVED' then coalesce(resolved_at,now()) when p_status is not null and p_status not in ('RESOLVED','CLOSED') then null else resolved_at end,
      closed_at=case when p_status='CLOSED' then coalesce(closed_at,now()) when p_status is not null and p_status<>'CLOSED' then null else closed_at end
  where id=p_ticket_id and school_id=v.school_id returning * into v_ticket;
  update public.staff_inquiry_ticket_members set member_role='MEMBER'
    where ticket_id=v_ticket.id and school_id=v.school_id and member_role='ASSIGNEE';
  if p_assigned_teacher_id is not null then
    insert into public.staff_inquiry_ticket_members(ticket_id,school_id,teacher_id,member_role)
    values(v_ticket.id,v.school_id,p_assigned_teacher_id,'ASSIGNEE')
    on conflict(ticket_id,teacher_id) do update set member_role='ASSIGNEE';
  end if;
  return jsonb_build_object('ok',true,'ticket',to_jsonb(v_ticket));
end $$;
revoke all on function public.rpc_chat_inquiry_update(text,bigint,text,text) from public;
grant execute on function public.rpc_chat_inquiry_update(text,bigint,text,text) to anon,authenticated;