-- SCMS v12 School Website: isolated public admission intake.
-- Release artifact only. Do not apply to production without explicit approval.
-- This schema is separate from students/parents and never creates Student Core rows.

create table if not exists public.website_sites (
  site_id uuid primary key default gen_random_uuid(),
  school_id text not null,
  hostname text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_sites_hostname_shape check (
    hostname = lower(hostname)
    and hostname !~ '[[:space:]/:@]'
    and length(hostname) between 4 and 253
    and position('.' in hostname) > 0
  )
);

create unique index if not exists website_sites_hostname_uniq
  on public.website_sites (hostname);
create index if not exists website_sites_school_active_idx
  on public.website_sites (school_id, active);

create table if not exists public.website_admission_applications (
  application_id uuid primary key default gen_random_uuid(),
  school_id text not null,
  source_hostname text not null,
  idempotency_key text not null,
  student_name text not null,
  date_of_birth date,
  applying_grade text not null,
  guardian_name text not null,
  guardian_phone text not null,
  guardian_email text,
  previous_school text,
  preferred_contact text not null default 'phone'
    check (preferred_contact in ('phone','email')),
  message text,
  source_host text not null,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending','reviewing','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_admission_school_idempotency_uniq
    unique (school_id, idempotency_key),
  constraint website_admission_idempotency_len check (char_length(trim(idempotency_key)) between 16 and 128),
  constraint website_admission_student_name_len check (char_length(trim(student_name)) between 1 and 160),
  constraint website_admission_guardian_name_len check (char_length(trim(guardian_name)) between 1 and 160),
  constraint website_admission_phone_len check (char_length(trim(guardian_phone)) between 3 and 40),
  constraint website_admission_email_len check (guardian_email is null or char_length(guardian_email) <= 254),
  constraint website_admission_grade_len check (char_length(trim(applying_grade)) between 1 and 80),
  constraint website_admission_previous_school_len check (previous_school is null or char_length(previous_school) <= 200),
  constraint website_admission_message_len check (message is null or char_length(message) <= 4000)
);

create index if not exists website_admission_school_status_created_idx
  on public.website_admission_applications (school_id, status, created_at desc);

create table if not exists public.website_admission_rate_limits (
  school_id text not null,
  identity_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (school_id, identity_hash),
  constraint website_admission_rate_identity_hash_shape
    check (identity_hash ~ '^[a-f0-9]{64}$')
);

alter table public.website_sites enable row level security;
alter table public.website_sites force row level security;
alter table public.website_admission_applications enable row level security;
alter table public.website_admission_applications force row level security;
alter table public.website_admission_rate_limits enable row level security;
alter table public.website_admission_rate_limits force row level security;

drop policy if exists website_sites_deny_client_access on public.website_sites;
create policy website_sites_deny_client_access on public.website_sites
  for all to anon, authenticated using (false) with check (false);
drop policy if exists website_admission_deny_client_access on public.website_admission_applications;
create policy website_admission_deny_client_access on public.website_admission_applications
  for all to anon, authenticated using (false) with check (false);
drop policy if exists website_admission_rate_deny_client_access on public.website_admission_rate_limits;
create policy website_admission_rate_deny_client_access on public.website_admission_rate_limits
  for all to anon, authenticated using (false) with check (false);

revoke all on public.website_sites from public, anon, authenticated;
revoke all on public.website_admission_applications from public, anon, authenticated;
revoke all on public.website_admission_rate_limits from public, anon, authenticated;

create or replace function public.rpc_website_admission_submit(
  p_hostname text,
  p_identity_hash text,
  p_idempotency_key text,
  p_student_name text,
  p_date_of_birth text,
  p_applying_grade text,
  p_guardian_name text,
  p_guardian_phone text,
  p_guardian_email text,
  p_previous_school text,
  p_preferred_contact text,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_site public.website_sites%rowtype;
  v_count integer;
  v_application_id uuid;
  v_hostname text;
  v_student_name text;
  v_guardian_name text;
  v_phone text;
  v_email text;
  v_grade text;
  v_previous_school text;
  v_preferred_contact text;
  v_message text;
  v_idempotency_key text;
  v_date_of_birth date;
begin
  v_hostname := lower(trim(coalesce(p_hostname, '')));
  v_student_name := trim(coalesce(p_student_name, ''));
  v_guardian_name := trim(coalesce(p_guardian_name, ''));
  v_phone := trim(coalesce(p_guardian_phone, ''));
  v_email := trim(coalesce(p_guardian_email, ''));
  v_grade := trim(coalesce(p_applying_grade, ''));
  v_previous_school := trim(coalesce(p_previous_school, ''));
  v_preferred_contact := lower(trim(coalesce(p_preferred_contact, 'phone')));
  v_message := trim(coalesce(p_message, ''));
  v_idempotency_key := trim(coalesce(p_idempotency_key, ''));

  if v_hostname !~ '^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$'
     or position('..' in v_hostname) > 0
     or position('.' in v_hostname) = 0
     or coalesce(p_identity_hash, '') !~ '^[a-f0-9]{64}$'
     or v_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or char_length(v_student_name) not between 1 and 160
     or char_length(v_guardian_name) not between 1 and 160
     or char_length(v_phone) not between 3 and 40
     or char_length(v_email) > 254
     or (v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
     or char_length(v_grade) not between 1 and 80
     or char_length(v_previous_school) > 200
     or v_preferred_contact not in ('phone','email')
     or char_length(v_message) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if nullif(trim(coalesce(p_date_of_birth, '')), '') is not null then
    if trim(p_date_of_birth) !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    begin
      v_date_of_birth := trim(p_date_of_birth)::date;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end;
    if v_date_of_birth > current_date then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
  end if;

  select * into v_site
    from public.website_sites
   where hostname = v_hostname
     and active = true
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_school');
  end if;

  insert into public.website_admission_rate_limits
    (school_id, identity_hash, window_started_at, request_count, updated_at)
  values
    (v_site.school_id, p_identity_hash, now(), 1, now())
  on conflict (school_id, identity_hash) do update
    set window_started_at = case
          when public.website_admission_rate_limits.window_started_at <= now() - interval '15 minutes'
          then now()
          else public.website_admission_rate_limits.window_started_at
        end,
        request_count = case
          when public.website_admission_rate_limits.window_started_at <= now() - interval '15 minutes'
          then 1
          else public.website_admission_rate_limits.request_count + 1
        end,
        updated_at = now()
  returning request_count into v_count;

  if v_count > 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.website_admission_applications
    (school_id, source_host, idempotency_key, student_name, date_of_birth, applying_grade,
     guardian_name, guardian_phone, guardian_email, previous_school, preferred_contact, message)
  values
    (v_site.school_id, v_hostname, v_idempotency_key, v_student_name, v_date_of_birth, v_grade,
     v_guardian_name, v_phone, nullif(v_email, ''), nullif(v_previous_school, ''),
     v_preferred_contact, nullif(v_message, ''))
  on conflict (school_id, idempotency_key) do nothing
  returning application_id into v_application_id;

  if v_application_id is null then
    return jsonb_build_object('ok', false, 'error', 'duplicate_request');
  end if;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$function$;

revoke all on function public.rpc_website_admission_submit(text,text,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.rpc_website_admission_submit(text,text,text,text,text,text,text,text,text) to service_role;

comment on table public.website_admission_applications is
  'Isolated public admission intake only; never a Student Core record. Client roles have no read/write access.';
comment on table public.website_sites is
  'Trusted hostname-to-school registry. Provisioned only through a separately authorized admin workflow.';
comment on function public.rpc_website_admission_submit(text,text,text,text,text,text,text,text,text) is
  'Service-role-only public intake RPC. Resolves school by exact trusted hostname, rate-limits hashed identity, enforces idempotency, and inserts only isolated intake records.';
