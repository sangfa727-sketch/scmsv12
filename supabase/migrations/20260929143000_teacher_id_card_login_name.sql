-- Teacher ID card RPC now returns the teacher login name for card display.
-- The function body is intentionally identical to the verified production definition
-- applied during the ID-card foundation work, with login_name included in the payload.

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
  t record;
  raw text;
  h text;
  c record;
begin
  select s.school_id, s.teacher_id as admin_id, t.role as admin_role
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

  select teacher_id, login_name, teacher_name, school_id, status, role, photo_url
    into t
  from public.teachers
  where teacher_id=p_teacher_id
    and school_id=a.school_id
  limit 1;

  if t is null then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  if t.status<>'active' then
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
    p_teacher_id, a.school_id, h, left(raw,10), p_expires_at, a.admin_id
  )
  returning * into c;

  return jsonb_build_object(
    'ok',true,
    'card_id',c.card_id,
    'teacher_id',t.teacher_id,
    'login_name',t.login_name,
    'teacher_name',t.teacher_name,
    'role',t.role,
    'photo_url',t.photo_url,
    'token',raw,
    'token_prefix',c.token_prefix,
    'expires_at',c.expires_at
  );
end;
$function$;
