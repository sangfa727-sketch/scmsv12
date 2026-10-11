-- SCMS v12 School Website: configurable platform domain and safe subdomain reservation.
-- No platform domain is inserted by this migration. The root domain must be configured
-- by the platform operator only after DNS, wildcard routing, and TLS have been verified.

create table if not exists public.website_platform_domains (
  domain_id uuid primary key default gen_random_uuid(),
  base_domain text not null unique,
  active boolean not null default false,
  is_default boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_platform_domain_shape check (
    base_domain = lower(trim(base_domain))
    and base_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and position('..' in base_domain) = 0
  ),
  constraint website_platform_domain_verified check (not active or verified_at is not null),
  constraint website_platform_default_active check (not is_default or active)
);

create unique index if not exists website_platform_domains_one_active_default
  on public.website_platform_domains(is_default)
  where active = true and is_default = true;

alter table public.website_platform_domains enable row level security;
alter table public.website_platform_domains force row level security;
drop policy if exists website_platform_domains_deny_client_access on public.website_platform_domains;
create policy website_platform_domains_deny_client_access on public.website_platform_domains
  for all to anon, authenticated using (false) with check (false);
revoke all on public.website_platform_domains from public, anon, authenticated;

alter table public.website_sites
  add column if not exists site_slug text,
  add column if not exists platform_domain text references public.website_platform_domains(base_domain),
  add column if not exists provisioning_status text not null default 'active';

update public.website_sites
   set provisioning_status = case when active then 'active' else 'pending_activation' end;

alter table public.website_sites
  drop constraint if exists website_sites_provisioning_status_check;
alter table public.website_sites
  add constraint website_sites_provisioning_status_check
  check (provisioning_status in ('pending_activation','active','suspended'));
alter table public.website_sites
  drop constraint if exists website_sites_site_slug_shape;
alter table public.website_sites
  add constraint website_sites_site_slug_shape check (
    site_slug is null or site_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  );

create unique index if not exists website_sites_school_platform_slug_uq
  on public.website_sites(school_id, platform_domain)
  where site_slug is not null and platform_domain is not null;

create or replace function public.rpc_school_website_get_site(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_base_domain text;
  v_site record;
  v_domain_ready boolean := false;
  v_has_publication boolean := false;
begin
  if nullif(trim(p_session_token), '') is null then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  select s.teacher_id, s.school_id
    into v_actor
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;
  if not found or private.web_has_permission(p_session_token, 'website.manage', null, null) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  select base_domain into v_base_domain
    from public.website_platform_domains
   where active = true and is_default = true and verified_at is not null
   limit 1;
  v_domain_ready := found;

  select site_slug, hostname, active, provisioning_status, platform_domain, created_at
    into v_site
    from public.website_sites
   where school_id = v_actor.school_id
   order by case when platform_domain = v_base_domain then 0 else 1 end, created_at desc
   limit 1;

  select exists(select 1 from public.website_publications where school_id = v_actor.school_id)
    into v_has_publication;

  return jsonb_build_object(
    'ok', true,
    'platform_domain_configured', v_domain_ready,
    'base_domain', v_base_domain,
    'found', found,
    'site', case when v_site.hostname is null then null else jsonb_build_object(
      'slug', v_site.site_slug,
      'hostname', v_site.hostname,
      'active', v_site.active,
      'status', v_site.provisioning_status,
      'platform_domain', v_site.platform_domain
    ) end,
    'has_publication', v_has_publication
  );
end;
$function$;

create or replace function public.rpc_school_website_provision_subdomain(
  p_session_token text,
  p_slug text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_base_domain text;
  v_slug text;
  v_hostname text;
  v_existing record;
  v_inserted text;
begin
  if nullif(trim(p_session_token), '') is null then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  select s.teacher_id, s.school_id
    into v_actor
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;
  if not found or private.web_has_permission(p_session_token, 'website.manage', null, null) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  v_slug := lower(trim(coalesce(p_slug, '')));
  if char_length(v_slug) not between 3 and 63
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or v_slug in ('www','api','admin','app','mail','scms','school','schools','static','assets','docs','support','status','help') then
    return jsonb_build_object('ok', false, 'error', 'invalid_slug');
  end if;

  select base_domain into v_base_domain
    from public.website_platform_domains
   where active = true and is_default = true and verified_at is not null
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'platform_domain_not_configured');
  end if;

  select site_slug, hostname, active, provisioning_status
    into v_existing
    from public.website_sites
   where school_id = v_actor.school_id
     and platform_domain = v_base_domain
   limit 1;
  if found then
    if v_existing.site_slug = v_slug then
      return jsonb_build_object('ok', true, 'hostname', v_existing.hostname,
        'active', v_existing.active, 'status', v_existing.provisioning_status, 'unchanged', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'site_already_provisioned',
      'hostname', v_existing.hostname, 'status', v_existing.provisioning_status);
  end if;

  v_hostname := v_slug || '.' || v_base_domain;
  insert into public.website_sites
    (school_id, hostname, active, site_slug, platform_domain, provisioning_status)
  values
    (v_actor.school_id, v_hostname, false, v_slug, v_base_domain, 'pending_activation')
  on conflict (hostname) do nothing
  returning hostname into v_inserted;

  if v_inserted is null then
    select school_id, active, provisioning_status
      into v_existing
      from public.website_sites
     where hostname = v_hostname
     limit 1;
    if v_existing.school_id = v_actor.school_id then
      return jsonb_build_object('ok', true, 'hostname', v_hostname,
        'active', v_existing.active, 'status', v_existing.provisioning_status, 'unchanged', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'hostname_unavailable');
  end if;

  insert into public.audit_log(source, actor, action, school_id, payload)
  values ('web','school_website_site_setup','website.site_reserved',v_actor.school_id,
          jsonb_build_object('hostname',v_hostname,'slug',v_slug,'status','pending_activation'));

  return jsonb_build_object('ok', true, 'hostname', v_hostname,
    'active', false, 'status', 'pending_activation', 'unchanged', false);
end;
$function$;

create or replace function public.rpc_school_website_activate_site(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_base_domain text;
  v_site record;
begin
  if nullif(trim(p_session_token), '') is null then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  select s.teacher_id, s.school_id
    into v_actor
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;
  if not found
     or private.web_has_permission(p_session_token, 'website.manage', null, null) is distinct from true
     or private.web_has_permission(p_session_token, 'website.publish', null, null) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  select base_domain into v_base_domain
    from public.website_platform_domains
   where active = true and is_default = true and verified_at is not null
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'platform_domain_not_configured');
  end if;

  select site_id, hostname, active, provisioning_status
    into v_site
    from public.website_sites
   where school_id = v_actor.school_id
     and platform_domain = v_base_domain
     and site_slug is not null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'site_not_found');
  end if;
  if not exists(select 1 from public.website_publications where school_id = v_actor.school_id) then
    return jsonb_build_object('ok', false, 'error', 'publication_required');
  end if;
  if v_site.active and v_site.provisioning_status = 'active' then
    return jsonb_build_object('ok', true, 'hostname', v_site.hostname, 'active', true, 'unchanged', true);
  end if;

  update public.website_sites
     set active = true,
         provisioning_status = 'active',
         updated_at = now()
   where site_id = v_site.site_id;

  insert into public.audit_log(source, actor, action, school_id, payload)
  values ('web','school_website_site_setup','website.site_activated',v_actor.school_id,
          jsonb_build_object('hostname',v_site.hostname,'status','active'));

  return jsonb_build_object('ok', true, 'hostname', v_site.hostname, 'active', true, 'unchanged', false);
end;
$function$;

revoke all on function public.rpc_school_website_get_site(text) from public;
revoke all on function public.rpc_school_website_provision_subdomain(text,text) from public;
revoke all on function public.rpc_school_website_activate_site(text) from public;
grant execute on function public.rpc_school_website_get_site(text) to anon, authenticated;
grant execute on function public.rpc_school_website_provision_subdomain(text,text) to anon, authenticated;
grant execute on function public.rpc_school_website_activate_site(text) to anon, authenticated;

comment on table public.website_platform_domains is
  'Platform-owned root domains. Configure a default only after the operator verifies DNS, wildcard routing, and TLS.';
