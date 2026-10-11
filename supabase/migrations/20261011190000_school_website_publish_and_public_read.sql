-- SCMS v12 School Website: review, atomic publication, and published-only public reads.
-- Release artifact only. Do not apply to production without explicit approval.
-- Public content is materialized separately from private drafts and Student Core.

insert into public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active, display_order)
values
  ('website.publish', 'school_website', 'Publish reviewed School Website content to the public site', 'global', true, true, 92)
on conflict (permission_key) do update set
  category = excluded.category,
  description = excluded.description,
  scope_type = excluded.scope_type,
  is_sensitive = true,
  is_active = true,
  display_order = excluded.display_order;

insert into public.role_permissions (role, permission_key, allowed)
values ('owner', 'website.publish', true),
       ('school_owner', 'website.publish', true),
       ('admin', 'website.publish', true),
       ('super_admin', 'website.publish', true)
on conflict (role, permission_key) do nothing;

alter table public.website_drafts
  drop constraint if exists website_drafts_status_check;
alter table public.website_drafts
  add constraint website_drafts_status_check check (status in ('draft','review','published'));

create table if not exists public.website_publications (
  publication_id uuid primary key default gen_random_uuid(),
  school_id text not null unique,
  template_key text not null check (template_key in ('modern','classic','premium')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  published_by text not null,
  published_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.website_publications enable row level security;
alter table public.website_publications force row level security;

drop policy if exists website_publications_deny_client_access on public.website_publications;
create policy website_publications_deny_client_access on public.website_publications
  for all to anon, authenticated using (false) with check (false);
revoke all on public.website_publications from public, anon, authenticated;

-- Extend the existing Studio gate with separate admission-review and publishing capabilities.
create or replace function public.rpc_school_website_authorize(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_school_id text;
  v_role text;
  v_admissions_authorized boolean;
  v_publish_authorized boolean;
begin
  if nullif(trim(p_session_token), '') is null then
    return jsonb_build_object('ok', false, 'authorized', false, 'error', 'access_denied');
  end if;

  select s.school_id, s.role
    into v_school_id, v_role
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'authorized', false, 'error', 'access_denied');
  end if;

  if private.web_has_permission(p_session_token, 'website.manage', null, null) is distinct from true then
    return jsonb_build_object('ok', false, 'authorized', false, 'error', 'access_denied');
  end if;

  v_admissions_authorized := private.web_has_permission(
    p_session_token, 'website.admissions.review', null, null
  ) is true;
  v_publish_authorized := private.web_has_permission(
    p_session_token, 'website.publish', null, null
  ) is true;

  return jsonb_build_object(
    'ok', true,
    'authorized', true,
    'school_id', v_school_id,
    'role', v_role,
    'admissions_authorized', coalesce(v_admissions_authorized, false),
    'publish_authorized', coalesce(v_publish_authorized, false)
  );
end;
$function$;

revoke all on function public.rpc_school_website_authorize(text) from public;
grant execute on function public.rpc_school_website_authorize(text) to anon, authenticated;

create or replace function public.rpc_school_website_submit_draft_for_review(
  p_session_token text,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_draft record;
begin
  if nullif(trim(p_session_token), '') is null or p_expected_version is null or p_expected_version < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
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

  select draft_id, status, version
    into v_draft
    from public.website_drafts
   where school_id = v_actor.school_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'draft_not_found');
  end if;
  if v_draft.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'error', 'stale_draft', 'current_version', v_draft.version);
  end if;
  if v_draft.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'invalid_draft_state', 'status', v_draft.status);
  end if;

  update public.website_drafts
     set status = 'review',
         version = version + 1,
         updated_by = v_actor.teacher_id,
         updated_at = now()
   where draft_id = v_draft.draft_id
  returning version, status, updated_at into v_draft;

  insert into public.audit_log(source, actor, action, school_id, payload)
  values ('web','school_website_review','website.review_requested',v_actor.school_id,
          jsonb_build_object('draft_version',v_draft.version));

  return jsonb_build_object('ok', true, 'status', v_draft.status, 'version', v_draft.version, 'updated_at', v_draft.updated_at);
end;
$function$;

create or replace function public.rpc_school_website_publish_draft(
  p_session_token text,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_draft record;
  v_publication record;
  v_site_active boolean;
begin
  if nullif(trim(p_session_token), '') is null or p_expected_version is null or p_expected_version < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
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

  select draft_id, content, status, version
    into v_draft
    from public.website_drafts
   where school_id = v_actor.school_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'draft_not_found');
  end if;
  if v_draft.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'error', 'stale_draft', 'current_version', v_draft.version);
  end if;
  if v_draft.status <> 'review' then
    return jsonb_build_object('ok', false, 'error', 'review_required', 'status', v_draft.status);
  end if;

  insert into public.website_publications
    (school_id, template_key, content, published_by, published_at, version, updated_at)
  values
    (v_actor.school_id, v_draft.content->>'template', v_draft.content, v_actor.teacher_id, now(), 1, now())
  on conflict (school_id) do update
    set template_key = excluded.template_key,
        content = excluded.content,
        published_by = excluded.published_by,
        published_at = now(),
        version = public.website_publications.version + 1,
        updated_at = now()
  returning publication_id, version, published_at into v_publication;

  update public.website_drafts
     set status = 'published',
         version = version + 1,
         updated_by = v_actor.teacher_id,
         updated_at = now()
   where draft_id = v_draft.draft_id
  returning version into v_draft;

  insert into public.audit_log(source, actor, action, school_id, payload)
  values ('web','school_website_publish','website.publish',v_actor.school_id,
          jsonb_build_object('publication_id',v_publication.publication_id,
                             'publication_version',v_publication.version,
                             'draft_version',v_draft.version));

  select exists(select 1 from public.website_sites where school_id = v_actor.school_id and active = true)
    into v_site_active;

  return jsonb_build_object(
    'ok', true,
    'status', 'published',
    'draft_version', v_draft.version,
    'publication_version', v_publication.version,
    'published_at', v_publication.published_at,
    'public_site_active', v_site_active
  );
end;
$function$;

create or replace function public.rpc_school_website_get_published(p_hostname text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_publication record;
  v_hostname text;
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

revoke all on function public.rpc_school_website_submit_draft_for_review(text,integer) from public;
revoke all on function public.rpc_school_website_publish_draft(text,integer) from public;
revoke all on function public.rpc_school_website_get_published(text) from public;
grant execute on function public.rpc_school_website_submit_draft_for_review(text,integer) to anon, authenticated;
grant execute on function public.rpc_school_website_publish_draft(text,integer) to anon, authenticated;
grant execute on function public.rpc_school_website_get_published(text) to anon, authenticated;

comment on table public.website_publications is
  'Public website content snapshots. Direct client table access is denied; public reads are resolved only through an active trusted hostname.';
