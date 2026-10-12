-- SCMS v12 School Website: serve published content only from verified hostnames.
-- Release artifact only. Do not apply to production without explicit approval.
-- Custom-domain verification must be performed by a trusted operator/service after DNS and TLS checks.
-- Client-facing roles cannot mutate either hostname registry.

create table if not exists public.website_custom_domains (
  domain_id uuid primary key default gen_random_uuid(),
  school_id text not null,
  hostname text not null unique,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','verified','active','suspended')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_custom_domains_hostname_shape check (
    hostname = lower(trim(hostname))
    and hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and position('..' in hostname) = 0
  ),
  constraint website_custom_domains_verified_state check (
    status not in ('verified','active') or verified_at is not null
  )
);

alter table public.website_custom_domains enable row level security;
alter table public.website_custom_domains force row level security;
drop policy if exists website_custom_domains_deny_client_access on public.website_custom_domains;
create policy website_custom_domains_deny_client_access
  on public.website_custom_domains for all to anon, authenticated
  using (false) with check (false);
revoke all on public.website_custom_domains from public, anon, authenticated;

create or replace function public.rpc_school_website_get_published(p_hostname text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_hostname text;
  v_publication record;
begin
  v_hostname := lower(trim(coalesce(p_hostname, '')));
  if v_hostname !~ '^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$'
     or position('..' in v_hostname) > 0 then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  select p.template_key, p.content, p.published_at, p.version
    into v_publication
    from public.website_sites s
    join public.website_publications p on p.school_id = s.school_id
   where s.hostname = v_hostname
     and s.active = true
     and (
       (
         s.site_slug is not null
         and s.platform_domain is not null
         and s.hostname = s.site_slug || '.' || s.platform_domain
         and exists (
           select 1 from public.website_platform_domains d
            where d.base_domain = s.platform_domain
              and d.active = true
              and d.is_default = true
              and d.verified_at is not null
         )
       )
       or exists (
         select 1 from public.website_custom_domains c
          where c.hostname = s.hostname
            and c.school_id = s.school_id
            and c.status = 'active'
            and c.verified_at is not null
       )
     )
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'template', v_publication.template_key,
    'content', v_publication.content,
    'published_at', v_publication.published_at,
    'version', v_publication.version
  );
end;
$function$;

revoke all on function public.rpc_school_website_get_published(text) from public;
grant execute on function public.rpc_school_website_get_published(text) to anon, authenticated;

comment on table public.website_custom_domains is
  'Private custom-host registry. Only a trusted operator/service may mark a domain verified/active after ownership, DNS, and TLS verification.';
comment on function public.rpc_school_website_get_published(text) is
  'Returns published public content only for an active verified platform subdomain or a matching active verified custom domain.';
