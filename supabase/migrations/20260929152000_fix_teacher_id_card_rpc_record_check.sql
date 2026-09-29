-- Corrective migration: avoid PL/pgSQL record/table-alias collisions and
-- keep teacher ID card school_id aligned with the existing text tenant key.
create or replace function public.rpc_admin_create_teacher_card(
  p_session_token text,
  p_teacher_id text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
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

  select teacher_id, login_name, teacher_name, school_id, status, role, photo_url
    into teacher_row
  from public.teachers
  where teacher_id=p_teacher_id
    and school_id=a.school_id
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
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