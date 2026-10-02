-- SCMS v12 — protect sensitive teacher-management actions from lower-tier admins.
-- Non-super-admins may manage ordinary teachers/admins, but cannot alter a super_admin
-- through password reset, login-name mutation, or teacher ID-card issuance/revocation.

create or replace function public.rpc_admin_reset_teacher_password(
  p_session_token text,
  p_teacher_id text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_admin record;
  v_target_role text;
begin
  select s.teacher_id, s.school_id, t.role as admin_role
    into v_admin
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id
  where s.session_token=p_session_token
    and s.expires_at>now()
    and t.status='active'
    and s.school_id=t.school_id
    and s.role=t.role
    and t.role in ('admin','super_admin')
  limit 1;

  if v_admin is null then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;

  select role into v_target_role
  from public.teachers
  where teacher_id=p_teacher_id
    and school_id=v_admin.school_id
  limit 1;

  if v_target_role is null then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  if v_admin.admin_role <> 'super_admin' and v_target_role='super_admin' then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  update public.teachers
     set password_hash=public._scms_hash_password(p_new_password),
         must_change_password=true,
         password_changed_at=now()
   where teacher_id=p_teacher_id
     and school_id=v_admin.school_id;

  delete from public.app_web_sessions where teacher_id=p_teacher_id;

  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.rpc_admin_set_teacher_login_name(
  p_session_token text,
  p_teacher_id text,
  p_login_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_admin record;
  v_target_role text;
  v_login_name text:=trim(p_login_name);
begin
  select s.school_id, t.role as admin_role
    into v_admin
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id
  where s.session_token=p_session_token
    and s.expires_at>now()
    and t.status='active'
    and s.school_id=t.school_id
    and s.role=t.role
    and t.role in ('admin','super_admin')
  limit 1;

  if v_admin is null then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;

  select role into v_target_role
  from public.teachers
  where teacher_id=p_teacher_id
    and school_id=v_admin.school_id
  limit 1;

  if v_target_role is null then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  if v_admin.admin_role <> 'super_admin' and v_target_role='super_admin' then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  if char_length(v_login_name)<3 or char_length(v_login_name)>64
     or v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
    return jsonb_build_object('ok',false,'error','invalid_login_name');
  end if;

  if exists(select 1 from public.teachers where lower(login_name)=lower(v_login_name) and teacher_id<>p_teacher_id) then
    return jsonb_build_object('ok',false,'error','duplicate_login_name');
  end if;

  update public.teachers
     set login_name=v_login_name
   where teacher_id=p_teacher_id
     and school_id=v_admin.school_id;

  return jsonb_build_object('ok',true,'login_name',v_login_name);
end;
$function$;

create or replace function public.rpc_admin_create_teacher_card(
  p_session_token text,
  p_teacher_id text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  a record;
  teacher_row public.teachers%rowtype;
  raw text;
  h text;
  c public.teacher_id_cards%rowtype;
begin
  select s.school_id, s.teacher_id as admin_id, admin_teacher.role as admin_role
    into a
  from public.app_web_sessions s
  join public.teachers admin_teacher on admin_teacher.teacher_id=s.teacher_id
  where s.session_token=p_session_token
    and s.expires_at>now()
    and admin_teacher.status='active'
    and s.school_id=admin_teacher.school_id
    and s.role=admin_teacher.role
    and admin_teacher.role in ('admin','super_admin')
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;

  select * into teacher_row
  from public.teachers
  where teacher_id=p_teacher_id
    and school_id=a.school_id
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  if a.admin_role <> 'super_admin' and teacher_row.role='super_admin' then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  if teacher_row.status <> 'active' then
    return jsonb_build_object('ok',false,'error','inactive');
  end if;

  raw := encode(extensions.gen_random_bytes(24),'hex');
  h := encode(extensions.digest(raw,'sha256'),'hex');

  update public.teacher_id_cards
     set revoked_at=now()
   where teacher_id=p_teacher_id
     and revoked_at is null;

  insert into public.teacher_id_cards(
    teacher_id, school_id, token_hash, token_prefix, expires_at, created_by_teacher_id
  )
  values(
    teacher_row.teacher_id, a.school_id, h, left(raw,10), p_expires_at, a.admin_id
  )
  returning * into c;

  return jsonb_build_object(
    'ok',true,
    'card_id',c.card_id,
    'teacher_id',teacher_row.teacher_id,
    'login_name',teacher_row.login_name,
    'teacher_name',teacher_row.teacher_name,
    'role',teacher_row.role,
    'photo_url',teacher_row.photo_url,
    'token',raw,
    'token_prefix',c.token_prefix,
    'expires_at',c.expires_at
  );
end;
$function$;

create or replace function public.rpc_admin_revoke_teacher_card(
  p_session_token text,
  p_teacher_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  a record;
  v_target_role text;
begin
  select s.school_id, t.role as admin_role
    into a
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id
  where s.session_token=p_session_token
    and s.expires_at>now()
    and t.status='active'
    and s.school_id=t.school_id
    and s.role=t.role
    and t.role in ('admin','super_admin')
  limit 1;

  if a is null then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;

  select role into v_target_role
  from public.teachers
  where teacher_id=p_teacher_id
    and school_id=a.school_id
  limit 1;

  if v_target_role is null then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  if a.admin_role <> 'super_admin' and v_target_role='super_admin' then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  update public.teacher_id_cards
     set revoked_at=now()
   where teacher_id=p_teacher_id
     and school_id=a.school_id
     and revoked_at is null;

  return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.rpc_admin_reset_teacher_password(text,text,text) from public;
grant execute on function public.rpc_admin_reset_teacher_password(text,text,text) to anon, authenticated;

revoke all on function public.rpc_admin_set_teacher_login_name(text,text,text) from public;
grant execute on function public.rpc_admin_set_teacher_login_name(text,text,text) to anon, authenticated;

revoke all on function public.rpc_admin_create_teacher_card(text,text,timestamptz) from public;
grant execute on function public.rpc_admin_create_teacher_card(text,text,timestamptz) to anon, authenticated;

revoke all on function public.rpc_admin_revoke_teacher_card(text,text) from public;
grant execute on function public.rpc_admin_revoke_teacher_card(text,text) to anon, authenticated;
