\set ON_ERROR_STOP on

-- Isolated PostgreSQL runtime coverage for the verified-host migration.
-- This creates only disposable test schema objects; it never connects to production.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$roles$;

create table public.website_platform_domains (
  domain_id uuid primary key default gen_random_uuid(),
  base_domain text not null unique,
  active boolean not null default false,
  is_default boolean not null default false,
  verified_at timestamptz
);

create table public.website_sites (
  school_id text not null,
  hostname text primary key,
  active boolean not null default false,
  site_slug text,
  platform_domain text
);

create table public.website_publications (
  publication_id uuid primary key default gen_random_uuid(),
  school_id text not null unique,
  template_key text not null,
  content jsonb not null,
  published_at timestamptz not null default now(),
  version integer not null default 1
);

\i supabase/migrations/20261012100000_school_website_verified_host_registry.sql

insert into public.website_publications (school_id, template_key, content)
values
  ('school-platform', 'modern', '{"schoolName":"Platform School"}'),
  ('school-custom', 'premium', '{"schoolName":"Custom Domain School"}'),
  ('school-mismatch', 'classic', '{"schoolName":"Mismatch School"}');

insert into public.website_sites (school_id, hostname, active, site_slug, platform_domain)
values
  ('school-platform', 'alpha.example.test', true, 'alpha', 'example.test'),
  ('school-custom', 'custom.school.test', true, null, null),
  ('school-mismatch', 'mismatch.school.test', true, null, null);

do $tests$
declare
  v_result jsonb;
begin
  -- Platform host must fail closed until the platform root is verified and active.
  v_result := public.rpc_school_website_get_published('alpha.example.test');
  if coalesce((v_result->>'found')::boolean, false) then
    raise exception 'unverified platform domain unexpectedly served content';
  end if;

  insert into public.website_platform_domains
    (base_domain, active, is_default, verified_at)
  values ('example.test', true, true, now());

  v_result := public.rpc_school_website_get_published('alpha.example.test');
  if not coalesce((v_result->>'found')::boolean, false)
     or v_result->'content'->>'schoolName' <> 'Platform School' then
    raise exception 'verified platform subdomain did not return the expected publication: %', v_result;
  end if;

  -- Custom hosts remain unavailable while pending or merely verified.
  insert into public.website_custom_domains (school_id, hostname, status, verified_at)
  values ('school-custom', 'custom.school.test', 'pending_verification', null);
  v_result := public.rpc_school_website_get_published('custom.school.test');
  if coalesce((v_result->>'found')::boolean, false) then
    raise exception 'pending custom domain unexpectedly served content';
  end if;

  update public.website_custom_domains
     set status = 'verified', verified_at = now()
   where hostname = 'custom.school.test';
  v_result := public.rpc_school_website_get_published('custom.school.test');
  if coalesce((v_result->>'found')::boolean, false) then
    raise exception 'verified but inactive custom domain unexpectedly served content';
  end if;

  update public.website_custom_domains
     set status = 'active'
   where hostname = 'custom.school.test';
  v_result := public.rpc_school_website_get_published('custom.school.test');
  if not coalesce((v_result->>'found')::boolean, false)
     or v_result->'content'->>'schoolName' <> 'Custom Domain School' then
    raise exception 'active verified custom domain did not return its own school publication: %', v_result;
  end if;

  -- A verified hostname mapped to a different school must not resolve.
  insert into public.website_custom_domains (school_id, hostname, status, verified_at)
  values ('school-platform', 'mismatch.school.test', 'active', now());
  v_result := public.rpc_school_website_get_published('mismatch.school.test');
  if coalesce((v_result->>'found')::boolean, false) then
    raise exception 'cross-school custom-domain mapping unexpectedly served content';
  end if;

  v_result := public.rpc_school_website_get_published('not a hostname');
  if coalesce((v_result->>'found')::boolean, false) then
    raise exception 'invalid hostname unexpectedly served content';
  end if;

  if has_table_privilege('anon', 'public.website_custom_domains', 'select')
     or has_table_privilege('authenticated', 'public.website_custom_domains', 'select') then
    raise exception 'client roles unexpectedly have SELECT privileges on the private registry';
  end if;
end
$tests$;

\echo 'Verified-host runtime tests passed.'
