create table if not exists public.staff_announcements (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  sender_teacher_id text not null,
  message_type text not null default 'announcement',
  recipient_type text not null,
  target_value text,
  reason text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint staff_announcements_message_type_chk check (message_type in ('announcement','task','notice')),
  constraint staff_announcements_recipient_type_chk check (recipient_type in ('all_staff','grade')),
  constraint staff_announcements_reason_chk check (length(btrim(reason)) between 1 and 500),
  constraint staff_announcements_body_chk check (length(btrim(body)) between 1 and 4000)
);
create table if not exists public.staff_announcement_recipients (
  announcement_id uuid not null references public.staff_announcements(id) on delete cascade,
  school_id text not null,
  teacher_id text not null,
  read_at timestamptz,
  primary key (announcement_id, teacher_id)
);
create index if not exists idx_staff_announcements_school_created on public.staff_announcements(school_id,created_at desc);
create index if not exists idx_staff_announcement_recipients_teacher on public.staff_announcement_recipients(school_id,teacher_id);
alter table public.staff_announcements enable row level security;
alter table public.staff_announcement_recipients enable row level security;
revoke all on public.staff_announcements from anon,authenticated;
revoke all on public.staff_announcement_recipients from anon,authenticated;

create or replace function public.rpc_chat_announcement_create(p_session_token text,p_recipient_type text,p_target text,p_message_type text,p_reason text,p_body text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_id uuid; v_target text:=nullif(btrim(p_target),''); v_reason text:=btrim(coalesce(p_reason,'')); v_body text:=btrim(coalesce(p_body,'')); v_count int;
begin
 select t.teacher_id,t.school_id,t.role into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if not found then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 if not (private.web_has_permission(p_session_token,'communication.send',null,null) or v_sess.role in ('admin','super_admin')) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
 if lower(coalesce(p_recipient_type,'')) not in ('all_staff','grade') then return jsonb_build_object('ok',false,'error','unsupported_recipient_type'); end if;
 if lower(coalesce(p_message_type,'')) not in ('announcement','task','notice') then return jsonb_build_object('ok',false,'error','invalid_message_type'); end if;
 if length(v_reason) not between 1 and 500 then return jsonb_build_object('ok',false,'error','invalid_reason'); end if;
 if length(v_body) not between 1 and 4000 then return jsonb_build_object('ok',false,'error','invalid_body'); end if;
 if lower(p_recipient_type)='grade' and (v_target is null or length(v_target)>100) then return jsonb_build_object('ok',false,'error','invalid_target'); end if;
 insert into public.staff_announcements(school_id,sender_teacher_id,message_type,recipient_type,target_value,reason,body) values(v_sess.school_id,v_sess.teacher_id,lower(p_message_type),lower(p_recipient_type),v_target,v_reason,v_body) returning id into v_id;
 if lower(p_recipient_type)='all_staff' then
   insert into public.staff_announcement_recipients(announcement_id,school_id,teacher_id)
   select v_id,v_sess.school_id,t.teacher_id from public.teachers t where t.school_id=v_sess.school_id and t.status='active' on conflict do nothing;
 else
   insert into public.staff_announcement_recipients(announcement_id,school_id,teacher_id)
   select distinct v_id,v_sess.school_id,t.teacher_id from public.teachers t join public.teacher_class_assignments a on a.teacher_id=t.teacher_id and a.school_id=t.school_id where t.school_id=v_sess.school_id and t.status='active' and a.status='active' and lower(a.class_name)=lower(v_target) on conflict do nothing;
 end if;
 select count(*) into v_count from public.staff_announcement_recipients r where r.announcement_id=v_id;
 if v_count=0 then delete from public.staff_announcements where id=v_id; return jsonb_build_object('ok',false,'error','no_verified_recipients'); end if;
 insert into public.audit_log(ts,source,actor,action,school_id,payload) values(now(),'staff_chat',v_sess.teacher_id,'official_announcement.create',v_sess.school_id,jsonb_build_object('announcement_id',v_id,'recipient_type',lower(p_recipient_type),'target',v_target,'message_type',lower(p_message_type),'recipient_count',v_count));
 return jsonb_build_object('ok',true,'announcement_id',v_id,'recipient_count',v_count);
end $$;

create or replace function public.rpc_chat_announcement_list(p_session_token text,p_limit int default 50) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_limit int:=least(greatest(coalesce(p_limit,50),1),100);
begin
 select t.teacher_id,t.school_id,t.role into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if not found then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 return jsonb_build_object('ok',true,'rows',coalesce((select jsonb_agg(x order by x.created_at desc) from (select a.id,a.message_type,a.recipient_type,a.target_value,a.reason,a.body,a.created_at,(select r.read_at from public.staff_announcement_recipients r where r.announcement_id=a.id and r.teacher_id=v_sess.teacher_id and r.school_id=v_sess.school_id) as read_at from public.staff_announcements a join public.staff_announcement_recipients me on me.announcement_id=a.id and me.teacher_id=v_sess.teacher_id and me.school_id=v_sess.school_id where a.school_id=v_sess.school_id order by a.created_at desc limit v_limit) x),'[]'::jsonb));
end $$;

create or replace function public.rpc_chat_announcement_mark_read(p_session_token text,p_announcement_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_count int;
begin
 select t.teacher_id,t.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if not found then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 update public.staff_announcement_recipients set read_at=coalesce(read_at,now()) where announcement_id=p_announcement_id and teacher_id=v_sess.teacher_id and school_id=v_sess.school_id;
 get diagnostics v_count=row_count;
 if v_count=0 then return jsonb_build_object('ok',false,'error','not_recipient'); end if;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.rpc_chat_announcement_create(text,text,text,text,text,text) from public;
revoke all on function public.rpc_chat_announcement_list(text,integer) from public;
revoke all on function public.rpc_chat_announcement_mark_read(text,uuid) from public;
grant execute on function public.rpc_chat_announcement_create(text,text,text,text,text,text) to anon,authenticated;
grant execute on function public.rpc_chat_announcement_list(text,integer) to anon,authenticated;
grant execute on function public.rpc_chat_announcement_mark_read(text,uuid) to anon,authenticated;