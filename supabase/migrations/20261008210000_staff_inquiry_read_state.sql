-- SCMS v12 — Staff Inquiry Ticket read state
alter table public.staff_inquiry_ticket_members
  add column if not exists last_read_at timestamptz not null default now();

create index if not exists idx_staff_inquiry_ticket_members_unread
  on public.staff_inquiry_ticket_members(ticket_id,teacher_id,last_read_at);

create or replace function public.rpc_chat_inquiry_mark_read(
  p_session_token text,
  p_ticket_id bigint
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v record;
begin
  select s.school_id,s.teacher_id,t.role into v
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id
  where s.session_token=p_session_token and s.expires_at>now()
    and t.status='active' and t.school_id=s.school_id and t.role=s.role limit 1;
  if v is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if not exists(select 1 from public.staff_inquiry_tickets x where x.id=p_ticket_id and x.school_id=v.school_id) then
    return jsonb_build_object('ok',false,'error','ticket_forbidden');
  end if;
  if v.role in ('admin','super_admin') then
    insert into public.staff_inquiry_ticket_members(ticket_id,school_id,teacher_id,member_role,last_read_at)
    values(p_ticket_id,v.school_id,v.teacher_id,'WATCHER',now())
    on conflict(ticket_id,teacher_id) do update set last_read_at=now();
  else
    if not exists(select 1 from public.staff_inquiry_ticket_members m where m.ticket_id=p_ticket_id and m.school_id=v.school_id and m.teacher_id=v.teacher_id)
       and not exists(select 1 from public.staff_inquiry_tickets x where x.id=p_ticket_id and x.school_id=v.school_id and x.created_by_teacher_id=v.teacher_id) then
      return jsonb_build_object('ok',false,'error','ticket_forbidden');
    end if;
    insert into public.staff_inquiry_ticket_members(ticket_id,school_id,teacher_id,member_role,last_read_at)
    values(p_ticket_id,v.school_id,v.teacher_id,'MEMBER',now())
    on conflict(ticket_id,teacher_id) do update set last_read_at=now();
  end if;
  return jsonb_build_object('ok',true,'ticket_id',p_ticket_id,'last_read_at',now());
end $$;

revoke all on function public.rpc_chat_inquiry_mark_read(text,bigint) from public;
grant execute on function public.rpc_chat_inquiry_mark_read(text,bigint) to anon,authenticated;
