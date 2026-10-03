-- Teacher authentication hardening: bind web login and QR cards to a unique teacher email.
-- Login Name remains an internal/admin identifier; it is no longer a public login credential.

do $$
begin
  update public.teachers
     set email = lower(trim(email))
   where nullif(trim(email), '') is not null;

  update public.teachers
     set email = lower(trim(teacher_email))
   where nullif(trim(email), '') is null
     and nullif(trim(teacher_email), '') is not null;

  if exists (
    select 1
      from public.teachers
     where nullif(trim(email), '') is not null
     group by lower(trim(email))
    having count(*) > 1
  ) then
    raise exception 'Duplicate teacher email addresses exist; resolve them before enabling email-bound teacher login';
  end if;
end $$;

create unique index if not exists teachers_email_ci_unique_idx
  on public.teachers (lower(trim(email)))
  where nullif(trim(email), '') is not null;

drop function if exists public.rpc_teacher_login(text, text, text);

create or replace function public.rpc_teacher_login(
  p_email text,
  p_password text,
  p_device_ua text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_teacher record;
  v_token text;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials',
      'message', 'Email သို့မဟုတ် password မှားနေပါတယ်'
    );
  end if;

  select teacher_id, teacher_name, school_id, status, role, password_hash,
         must_change_password, email
    into v_teacher
    from public.teachers
   where lower(trim(email)) = v_email
   limit 1;

  if v_teacher is null
     or v_teacher.status <> 'active'
     or nullif(trim(v_teacher.email), '') is null
     or v_teacher.password_hash is null
     or not (v_teacher.password_hash = extensions.crypt(p_password, v_teacher.password_hash))
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials',
      'message', 'Email သို့မဟုတ် password မှားနေပါတယ်'
    );
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.app_web_sessions
    (session_token, teacher_id, school_id, role, device_ua)
  values
    (v_token, v_teacher.teacher_id, v_teacher.school_id, v_teacher.role, p_device_ua);

  update public.teachers
     set last_web_login_at = now()
   where teacher_id = v_teacher.teacher_id;

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'teacher_id', v_teacher.teacher_id,
    'teacher_name', v_teacher.teacher_name,
    'school_id', v_teacher.school_id,
    'role', v_teacher.role,
    'must_change_password', v_teacher.must_change_password
  );
end;
$function$;

create table if not exists public.teacher_card_login_challenges (
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  challenge_hash text not null unique,
  card_id uuid not null references public.teacher_id_cards(card_id) on delete cascade,
  teacher_id text not null references public.teachers(teacher_id) on delete cascade,
  school_id uuid not null,
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists teacher_card_login_challenges_expiry_idx
  on public.teacher_card_login_challenges (expires_at)
  where consumed_at is null;

drop function if exists public.rpc_teacher_web_login(text, text, text);

create or replace function public.rpc_teacher_web_login(
  p_challenge text,
  p_password text,
  p_device_ua text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_challenge record;
  v_teacher record;
  v_token text;
begin
  if coalesce(length(trim(p_challenge)), 0) < 32
     or coalesce(p_password, '') = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials',
      'message', 'Teacher card သို့မဟုတ် password မှားနေပါတယ်'
    );
  end if;

  select ch.challenge_id, ch.card_id, ch.teacher_id, ch.school_id,
         ch.expires_at, ch.consumed_at
    into v_challenge
    from public.teacher_card_login_challenges ch
   where ch.challenge_hash =
         encode(extensions.digest(trim(p_challenge), 'sha256'), 'hex')
   for update;

  if v_challenge is null
     or v_challenge.consumed_at is not null
     or v_challenge.expires_at <= now()
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_challenge',
      'message', 'Teacher card session expired. Please scan the card again.'
    );
  end if;

  select teacher_id, teacher_name, school_id, status, role, password_hash,
         must_change_password, email
    into v_teacher
    from public.teachers
   where teacher_id = v_challenge.teacher_id
     and school_id = v_challenge.school_id
   limit 1;

  if v_teacher is null
     or v_teacher.status <> 'active'
     or nullif(trim(v_teacher.email), '') is null
     or v_teacher.password_hash is null
     or not (v_teacher.password_hash = extensions.crypt(p_password, v_teacher.password_hash))
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials',
      'message', 'Teacher card သို့မဟုတ် password မှားနေပါတယ်'
    );
  end if;

  update public.teacher_card_login_challenges
     set consumed_at = now()
   where challenge_id = v_challenge.challenge_id
     and consumed_at is null;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_challenge',
      'message', 'Teacher card session expired. Please scan the card again.'
    );
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.app_web_sessions
    (session_token, teacher_id, school_id, role, device_ua)
  values
    (v_token, v_teacher.teacher_id, v_teacher.school_id, v_teacher.role, p_device_ua);

  update public.teachers
     set last_web_login_at = now()
   where teacher_id = v_teacher.teacher_id;

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'teacher_id', v_teacher.teacher_id,
    'teacher_name', v_teacher.teacher_name,
    'school_id', v_teacher.school_id,
    'role', v_teacher.role,
    'must_change_password', v_teacher.must_change_password
  );
end;
$function$;

create or replace function public.rpc_teacher_card_login_start(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  h text;
  c record;
  t record;
  raw_challenge text;
  challenge_hash text;
begin
  if coalesce(length(trim(p_token)), 0) < 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_card');
  end if;

  h := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');

  select *
    into c
    from public.teacher_id_cards
   where token_hash = h
     and revoked_at is null
     and (expires_at is null or expires_at > now())
   limit 1;

  if c is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_card');
  end if;

  select teacher_id, teacher_name, school_id, role, status, email
    into t
    from public.teachers
   where teacher_id = c.teacher_id
     and school_id = c.school_id
   limit 1;

  if t is null
     or t.status <> 'active'
     or nullif(trim(t.email), '') is null
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_card');
  end if;

  update public.teacher_id_cards
     set last_used_at = now()
   where card_id = c.card_id;

  -- The QR proof is converted into a short-lived, one-time challenge.
  -- Store only the challenge hash; never persist the raw challenge.
  raw_challenge := encode(extensions.gen_random_bytes(32), 'hex');
  challenge_hash := encode(extensions.digest(raw_challenge, 'sha256'), 'hex');

  insert into public.teacher_card_login_challenges
    (challenge_hash, card_id, teacher_id, school_id, expires_at)
  values
    (challenge_hash, c.card_id, t.teacher_id, t.school_id, now() + interval '2 minutes');

  return jsonb_build_object(
    'ok', true,
    'card_id', c.card_id,
    'challenge_id', raw_challenge,
    'teacher_name', t.teacher_name,
    'role', t.role,
    'school_id', t.school_id,
    'requires_pin', true
  );
end;
$function$;

create or replace function public.rpc_admin_create_teacher_card(
  p_session_token text,
  p_teacher_id text,
  p_expires_at timestamp with time zone default null
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
    join public.teachers admin_teacher on admin_teacher.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and admin_teacher.status = 'active'
     and s.school_id = admin_teacher.school_id
     and s.role = admin_teacher.role
     and admin_teacher.role in ('admin', 'super_admin')
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select *
    into teacher_row
    from public.teachers
   where teacher_id = p_teacher_id
     and school_id = a.school_id
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  end if;

  if a.admin_role <> 'super_admin' and teacher_row.role = 'super_admin' then
    return jsonb_build_object('ok', false, 'error', 'insufficient_role');
  end if;

  if teacher_row.status <> 'active'
     or nullif(trim(teacher_row.email), '') is null
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'email_required',
      'message', 'Teacher email သတ်မှတ်ပြီးမှ ID Card ထုတ်နိုင်ပါတယ်'
    );
  end if;

  raw := encode(extensions.gen_random_bytes(24), 'hex');
  h := encode(extensions.digest(raw, 'sha256'), 'hex');

  update public.teacher_id_cards
     set revoked_at = now()
   where teacher_id = p_teacher_id
     and revoked_at is null;

  insert into public.teacher_id_cards
    (teacher_id, school_id, token_hash, token_prefix, expires_at, created_by_teacher_id)
  values
    (teacher_row.teacher_id, a.school_id, h, left(raw, 10), p_expires_at, a.admin_id)
  returning * into c;

  return jsonb_build_object(
    'ok', true,
    'card_id', c.card_id,
    'teacher_id', teacher_row.teacher_id,
    'login_name', teacher_row.login_name,
    'teacher_name', teacher_row.teacher_name,
    'role', teacher_row.role,
    'photo_url', teacher_row.photo_url,
    'token', raw,
    'token_prefix', c.token_prefix,
    'expires_at', c.expires_at
  );
end;
$function$;

create or replace function public.rpc_admin_create_teacher_v2(
  p_session_token text,
  p_teacher_id text,
  p_login_name text,
  p_teacher_name text,
  p_initial_pin text,
  p_role text default 'teacher',
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin record;
  v_login_name text := trim(p_login_name);
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  select s.teacher_id, s.school_id, s.role as session_role, t.role as teacher_role
    into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and s.school_id = t.school_id
     and s.role = t.role
     and t.role in ('admin', 'super_admin')
   limit 1;

  if v_admin is null then
    return jsonb_build_object('ok', false, 'error', 'not_admin', 'message', 'Admin login လိုအပ်ပါတယ်');
  end if;

  if p_role not in ('admin', 'teacher') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;

  if p_role = 'admin' and v_admin.teacher_role <> 'super_admin' then
    return jsonb_build_object('ok', false, 'error', 'insufficient_role');
  end if;

  if char_length(v_login_name) < 3
     or char_length(v_login_name) > 64
     or v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_login_name',
      'message', 'Login name must be 3-64 characters using letters, numbers, dot, underscore, or hyphen.'
    );
  end if;

  if char_length(p_initial_pin) < 6 then
    return jsonb_build_object('ok', false, 'error', 'pin_too_short', 'message', 'PIN must be at least 6 characters');
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    return jsonb_build_object('ok', false, 'error', 'email_required', 'message', 'Teacher email လိုအပ်ပါတယ်');
  end if;

  if exists(select 1 from public.teachers where lower(teacher_id) = lower(p_teacher_id)) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_id', 'message', 'ဒီ Teacher ID နဲ့ account ရှိနေပါပြီ');
  end if;

  if exists(select 1 from public.teachers where lower(login_name) = lower(v_login_name)) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_login_name', 'message', 'ဒီ Login name ကို အသုံးပြုထားပြီးပါပြီ');
  end if;

  if exists(select 1 from public.teachers where lower(trim(email)) = v_email) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_email', 'message', 'ဒီ email ကို အသုံးပြုထားပြီးပါပြီ');
  end if;

  insert into public.teachers
    (teacher_id, login_name, teacher_name, school_id, status, role, email,
     password_hash, must_change_password, password_changed_at)
  values
    (p_teacher_id, v_login_name, p_teacher_name, v_admin.school_id, 'active',
     p_role, v_email, public._scms_hash_password(p_initial_pin), true, now());

  return jsonb_build_object(
    'ok', true,
    'teacher_id', p_teacher_id,
    'login_name', v_login_name,
    'teacher_name', p_teacher_name,
    'school_id', v_admin.school_id,
    'role', p_role,
    'message', 'Teacher account ဖန်တီးပြီးပါပြီ။ ပထမဆုံး login တွင် password ပြောင်းရပါမယ်။'
  );
end;
$function$;

create or replace function public.rpc_admin_update_teacher_profile(
  p_session_token text,
  p_teacher_id text,
  p_teacher_name text,
  p_login_name text,
  p_email text default null,
  p_role text default 'teacher'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin record;
  v_target_role text;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  select s.teacher_id, s.school_id, s.role as session_role, t.role as admin_role
    into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and s.school_id = t.school_id
     and s.role = t.role
     and t.role in ('admin', 'super_admin')
   limit 1;

  if v_admin is null then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  if p_role not in ('teacher', 'admin', 'super_admin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    return jsonb_build_object('ok', false, 'error', 'email_required', 'message', 'Teacher email လိုအပ်ပါတယ်');
  end if;

  select role into v_target_role
    from public.teachers
   where teacher_id = p_teacher_id
     and school_id = v_admin.school_id
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  end if;

  if v_admin.admin_role <> 'super_admin'
     and (p_role in ('admin', 'super_admin') or v_target_role = 'super_admin')
  then
    return jsonb_build_object('ok', false, 'error', 'insufficient_role');
  end if;

  if exists (
    select 1 from public.teachers
     where lower(login_name) = lower(trim(p_login_name))
       and teacher_id <> p_teacher_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_login_name');
  end if;

  if exists (
    select 1 from public.teachers
     where lower(trim(email)) = v_email
       and teacher_id <> p_teacher_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_email');
  end if;

  update public.teachers
     set teacher_name = p_teacher_name,
         login_name = trim(p_login_name),
         email = v_email
   where teacher_id = p_teacher_id
     and school_id = v_admin.school_id;

  if p_role is not null then
    update public.teachers set role = p_role
     where teacher_id = p_teacher_id
       and school_id = v_admin.school_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'teacher_id', p_teacher_id,
    'teacher_name', p_teacher_name,
    'login_name', trim(p_login_name),
    'email', v_email,
    'role', p_role
  );
end;
$function$;
