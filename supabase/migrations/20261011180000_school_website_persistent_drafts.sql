-- SCMS v12 School Website: durable, tenant-scoped Website Studio drafts.
-- Release artifact only; do not apply to production without explicit approval.
-- Draft data remains isolated from Student/Teacher Production Core.

create table if not exists public.website_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  school_id text not null unique,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'draft' check (status in ('draft','review')),
  version integer not null default 1 check (version > 0),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.website_drafts enable row level security;
alter table public.website_drafts force row level security;

drop policy if exists website_drafts_deny_client_access on public.website_drafts;
create policy website_drafts_deny_client_access on public.website_drafts
  for all to anon, authenticated using (false) with check (false);
revoke all on public.website_drafts from public, anon, authenticated;

create or replace function public.rpc_school_website_normalize_draft(p_content jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_template text;
  v_programs jsonb;
  v_facilities jsonb;
  v_news jsonb;
  v_sections jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return null;
  end if;
  v_template := lower(trim(coalesce(p_content->>'template', '')));
  if v_template not in ('modern','classic','premium') then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(item.cleaned) order by item.ordinality), '[]'::jsonb)
    into v_programs
    from (
      select left(btrim(e.value #>> '{}'), 200) as cleaned, e.ordinality
        from jsonb_array_elements(case when jsonb_typeof(p_content->'programs') = 'array'
          then p_content->'programs' else '[]'::jsonb end) with ordinality as e(value, ordinality)
       where jsonb_typeof(e.value) = 'string'
         and btrim(e.value #>> '{}') <> ''
       order by e.ordinality
       limit 50
    ) item;

  select coalesce(jsonb_agg(to_jsonb(item.cleaned) order by item.ordinality), '[]'::jsonb)
    into v_facilities
    from (
      select left(btrim(e.value #>> '{}'), 200) as cleaned, e.ordinality
        from jsonb_array_elements(case when jsonb_typeof(p_content->'facilities') = 'array'
          then p_content->'facilities' else '[]'::jsonb end) with ordinality as e(value, ordinality)
       where jsonb_typeof(e.value) = 'string'
         and btrim(e.value #>> '{}') <> ''
       order by e.ordinality
       limit 50
    ) item;

  select coalesce(jsonb_agg(to_jsonb(item.cleaned) order by item.ordinality), '[]'::jsonb)
    into v_news
    from (
      select left(btrim(e.value #>> '{}'), 200) as cleaned, e.ordinality
        from jsonb_array_elements(case when jsonb_typeof(p_content->'news') = 'array'
          then p_content->'news' else '[]'::jsonb end) with ordinality as e(value, ordinality)
       where jsonb_typeof(e.value) = 'string'
         and btrim(e.value #>> '{}') <> ''
       order by e.ordinality
       limit 50
    ) item;

  with raw_sections as (
    select
      lower(left(btrim(coalesce(e.value->>'id','')), 64)) as section_id,
      lower(left(btrim(coalesce(e.value->>'type','')), 32)) as section_type,
      left(btrim(coalesce(e.value->>'label','')), 80) as section_label,
      case when jsonb_typeof(e.value->'visible') = 'boolean'
        then (e.value->>'visible')::boolean else true end as visible,
      e.ordinality
    from jsonb_array_elements(case when jsonb_typeof(p_content->'sections') = 'array'
      then p_content->'sections' else '[]'::jsonb end) with ordinality as e(value, ordinality)
    where jsonb_typeof(e.value) = 'object'
  ), valid_sections as (
    select *, row_number() over (partition by section_id order by ordinality) as duplicate_rank
      from raw_sections
     where section_id ~ '^[a-z0-9_-]{1,64}$'
       and section_type in ('hero','about','programs','facilities','news','contact','admissions','gallery')
       and section_label <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', section_id,
    'type', section_type,
    'label', section_label,
    'visible', case when section_type = 'hero' then true else visible end,
    'locked', section_type = 'hero'
  ) order by ordinality), '[]'::jsonb)
    into v_sections
    from (
      select * from valid_sections
       where duplicate_rank = 1
       order by ordinality
       limit 30
    ) item;

  return jsonb_build_object(
    'template', v_template,
    'schoolName', left(btrim(coalesce(p_content->>'schoolName','')), 200),
    'tagline', left(btrim(coalesce(p_content->>'tagline','')), 300),
    'aboutTitle', left(btrim(coalesce(p_content->>'aboutTitle','')), 200),
    'aboutText', left(btrim(coalesce(p_content->>'aboutText','')), 4000),
    'contactTitle', left(btrim(coalesce(p_content->>'contactTitle','')), 200),
    'contactText', left(btrim(coalesce(p_content->>'contactText','')), 2000),
    'programs', v_programs,
    'facilities', v_facilities,
    'news', v_news,
    'sections', v_sections
  );
end;
$function$;

revoke all on function public.rpc_school_website_normalize_draft(jsonb) from public, anon, authenticated;

create or replace function public.rpc_school_website_load_draft(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_draft record;
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

  select draft_id, content, status, version, updated_at
    into v_draft
    from public.website_drafts
   where school_id = v_actor.school_id
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'found', false, 'version', 0);
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'draft_id', v_draft.draft_id,
    'content', v_draft.content,
    'status', v_draft.status,
    'version', v_draft.version,
    'updated_at', v_draft.updated_at
  );
end;
$function$;

create or replace function public.rpc_school_website_save_draft(
  p_session_token text,
  p_content jsonb,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_draft record;
  v_content jsonb;
begin
  if nullif(trim(p_session_token), '') is null
     or p_expected_version is null
     or p_expected_version < 0
     or p_content is null
     or octet_length(p_content::text) > 100000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  v_content := public.rpc_school_website_normalize_draft(p_content);
  if v_content is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_content');
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

  select draft_id, version
    into v_draft
    from public.website_drafts
   where school_id = v_actor.school_id
   for update;

  if not found then
    if p_expected_version <> 0 then
      return jsonb_build_object('ok', false, 'error', 'stale_draft', 'current_version', 0);
    end if;
    insert into public.website_drafts
      (school_id, content, status, version, created_by, updated_by)
    values
      (v_actor.school_id, v_content, 'draft', 1, v_actor.teacher_id, v_actor.teacher_id)
    returning draft_id, content, status, version, updated_at into v_draft;
  else
    if v_draft.version <> p_expected_version then
      return jsonb_build_object('ok', false, 'error', 'stale_draft', 'current_version', v_draft.version);
    end if;
    update public.website_drafts
       set content = v_content,
           status = 'draft',
           version = version + 1,
           updated_by = v_actor.teacher_id,
           updated_at = now()
     where draft_id = v_draft.draft_id
    returning draft_id, content, status, version, updated_at into v_draft;
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'draft_id', v_draft.draft_id,
    'content', v_draft.content,
    'status', v_draft.status,
    'version', v_draft.version,
    'updated_at', v_draft.updated_at
  );
end;
$function$;

revoke all on function public.rpc_school_website_load_draft(text) from public;
revoke all on function public.rpc_school_website_save_draft(text,jsonb,integer) from public;
grant execute on function public.rpc_school_website_load_draft(text) to anon, authenticated;
grant execute on function public.rpc_school_website_save_draft(text,jsonb,integer) to anon, authenticated;

comment on table public.website_drafts is
  'Private tenant-scoped Website Studio drafts. Public clients cannot read drafts; public rendering must use a separate published-only read path.';
