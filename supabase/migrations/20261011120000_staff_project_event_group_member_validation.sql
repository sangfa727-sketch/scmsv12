-- SCMS v12 — Reject invalid Group Chat membership requests atomically.
-- Validate the complete member list before creating the group so a success
-- response can never silently omit a selected member.

create or replace function public.rpc_chat_group_create(
  p_session_token text,
  p_name text,
  p_description text default null,
  p_group_type text default 'PROJECT',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_member_teacher_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v record;
  g_id bigint;
  member_id text;
  v_members jsonb := coalesce(p_member_teacher_ids,'[]'::jsonb);
begin
  select s.school_id,s.teacher_id,t.teacher_name,t.role into v
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id
  where s.session_token=p_session_token and s.expires_at>now()
    and t.status='active' and t.school_id=s.school_id and t.role=s.role
  limit 1;
  if v is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  if nullif(trim(p_name),'') is null or char_length(trim(p_name))>160 then
    return jsonb_build_object('ok',false,'error','bad_name');
  end if;
  if p_group_type is null or p_group_type not in ('PROJECT','EVENT') then
    return jsonb_build_object('ok',false,'error','bad_group_type');
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<p_starts_at then
    return jsonb_build_object('ok',false,'error','bad_time_range');
  end if;

  if jsonb_typeof(v_members) is distinct from 'array' then
    return jsonb_build_object('ok',false,'error','invalid_member_list');
  end if;
  if jsonb_array_length(v_members)>100 then
    return jsonb_build_object('ok',false,'error','too_many_members');
  end if;
  if exists(
    select 1
    from jsonb_array_elements(v_members) as e(value)
    where jsonb_typeof(e.value) is distinct from 'string'
       or nullif(btrim(e.value #>> '{}'),'') is null
  ) then
    return jsonb_build_object('ok',false,'error','invalid_member_list');
  end if;
  if exists(
    select 1
    from (
      select e.value #>> '{}' as teacher_id
      from jsonb_array_elements(v_members) as e(value)
    ) selected
    group by selected.teacher_id
    having count(*)>1
  ) then
    return jsonb_build_object('ok',false,'error','duplicate_member_id');
  end if;
  if exists(
    select 1
    from jsonb_array_elements_text(v_members) as selected(teacher_id)
    where selected.teacher_id=v.teacher_id
       or not exists(
         select 1 from public.teachers t
         where t.teacher_id=selected.teacher_id
           and t.school_id=v.school_id
           and t.status='active'
       )
  ) then
    return jsonb_build_object('ok',false,'error','invalid_group_member');
  end if;

  insert into public.staff_project_event_groups(
    school_id,name,description,group_type,created_by_teacher_id,created_by_teacher_name,starts_at,ends_at
  ) values(
    v.school_id,trim(p_name),nullif(trim(p_description),''),p_group_type,
    v.teacher_id,v.teacher_name,p_starts_at,p_ends_at
  ) returning id into g_id;

  insert into public.staff_project_event_group_members(group_id,school_id,teacher_id,member_role)
  values(g_id,v.school_id,v.teacher_id,'OWNER');

  for member_id in select jsonb_array_elements_text(v_members) loop
    insert into public.staff_project_event_group_members(group_id,school_id,teacher_id,member_role)
    values(g_id,v.school_id,member_id,'MEMBER');
  end loop;

  return jsonb_build_object('ok',true,'group_id',g_id);
end
$function$;

revoke all on function public.rpc_chat_group_create(text,text,text,text,timestamptz,timestamptz,jsonb) from public;
grant execute on function public.rpc_chat_group_create(text,text,text,text,timestamptz,timestamptz,jsonb) to anon,authenticated;
