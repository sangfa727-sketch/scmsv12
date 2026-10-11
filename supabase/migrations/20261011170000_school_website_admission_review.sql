-- SCMS v12 School Website: private admission review queue.
-- Release artifact only; do not apply to production without explicit approval.
-- Intake rows remain separate from Student Core. This migration adds staff review only.

-- Admission applications contain child/guardian personal information, so review access
-- is separate from ordinary public-website content editing.
insert into public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active, display_order)
values
  ('website.admissions.review', 'school_website', 'Review public admission applications and update their intake status', 'global', true, true, 91)
on conflict (permission_key) do update set
  category = excluded.category,
  description = excluded.description,
  scope_type = excluded.scope_type,
  is_sensitive = true,
  is_active = true,
  display_order = excluded.display_order;

insert into public.role_permissions (role, permission_key, allowed)
values ('owner', 'website.admissions.review', true),
       ('school_owner', 'website.admissions.review', true),
       ('admin', 'website.admissions.review', true),
       ('super_admin', 'website.admissions.review', true)
on conflict (role, permission_key) do nothing;

create or replace function public.rpc_school_website_list_admissions(
  p_session_token text,
  p_before_created_at timestamptz default null,
  p_before_application_id uuid default null,
  p_limit integer default 25
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_limit integer;
  v_count integer;
  v_items jsonb;
  v_has_more boolean := false;
  v_next_created_at timestamptz;
  v_next_application_id uuid;
begin
  if nullif(trim(p_session_token), '') is null
     or ((p_before_created_at is null) <> (p_before_application_id is null)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select s.teacher_id, s.school_id, s.role
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
  if not found then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  if private.web_has_permission(p_session_token, 'website.admissions.review', null, null) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'application_id', page.application_id,
      'status', page.status,
      'student_name', page.student_name,
      'date_of_birth', page.date_of_birth,
      'applying_grade', page.applying_grade,
      'guardian_name', page.guardian_name,
      'guardian_phone', page.guardian_phone,
      'guardian_email', page.guardian_email,
      'previous_school', page.previous_school,
      'preferred_contact', page.preferred_contact,
      'message', page.message,
      'source_host', page.source_host,
      'created_at', page.created_at,
      'updated_at', page.updated_at
    ) order by page.created_at desc, page.application_id desc), '[]'::jsonb),
    count(*)::integer
  into v_items, v_count
  from (
    select a.application_id, a.status, a.student_name, a.date_of_birth, a.applying_grade,
           a.guardian_name, a.guardian_phone, a.guardian_email, a.previous_school,
           a.preferred_contact, a.message, a.source_host, a.created_at, a.updated_at
      from public.website_admission_applications a
     where a.school_id = v_actor.school_id
       and (
         p_before_created_at is null
         or (a.created_at, a.application_id) < (p_before_created_at, p_before_application_id)
       )
     order by a.created_at desc, a.application_id desc
     limit v_limit + 1
  ) page;

  if v_count > v_limit then
    v_has_more := true;
    v_items := v_items - v_limit;
    v_next_created_at := (v_items -> (v_limit - 1) ->> 'created_at')::timestamptz;
    v_next_application_id := (v_items -> (v_limit - 1) ->> 'application_id')::uuid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'has_more', v_has_more,
    'next_cursor_created_at', v_next_created_at,
    'next_cursor_application_id', v_next_application_id
  );
end;
$function$;

create or replace function public.rpc_school_website_update_admission_status(
  p_session_token text,
  p_application_id uuid,
  p_new_status text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_application record;
begin
  if nullif(trim(p_session_token), '') is null
     or p_application_id is null
     or p_expected_updated_at is null
     or p_new_status is null
     or p_new_status not in ('reviewing','accepted','rejected','withdrawn') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select s.teacher_id, s.school_id, s.role
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
  if not found then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  if private.web_has_permission(p_session_token, 'website.manage', null, null) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'access_denied');
  end if;

  select application_id, school_id, status, updated_at
    into v_application
    from public.website_admission_applications
   where application_id = p_application_id
     and school_id = v_actor.school_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'application_not_found');
  end if;

  if v_application.updated_at <> p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale_application');
  end if;

  if v_application.status = p_new_status then
    return jsonb_build_object('ok', true, 'status', v_application.status, 'unchanged', true);
  end if;

  if v_application.status = 'pending' then
    if p_new_status not in ('reviewing','accepted','rejected','withdrawn') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status_transition');
    end if;
  elsif v_application.status = 'reviewing' then
    if p_new_status not in ('accepted','rejected','withdrawn') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status_transition');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'application_closed');
  end if;

  update public.website_admission_applications
     set status = p_new_status,
         updated_at = now()
   where application_id = v_application.application_id
     and school_id = v_actor.school_id;

  insert into public.audit_log(source, actor, action, school_id, payload)
  values (
    'web',
    'school_website_admission_review',
    'website.admission_status_changed',
    v_actor.school_id,
    jsonb_build_object(
      'application_id', v_application.application_id,
      'previous_status', v_application.status,
      'new_status', p_new_status
    )
  );

  return jsonb_build_object('ok', true, 'status', p_new_status, 'unchanged', false);
end;
$function$;

revoke all on function public.rpc_school_website_list_admissions(text,timestamptz,uuid,integer) from public;
revoke all on function public.rpc_school_website_update_admission_status(text,uuid,text,timestamptz) from public;
grant execute on function public.rpc_school_website_list_admissions(text,timestamptz,uuid,integer) to anon, authenticated;
grant execute on function public.rpc_school_website_update_admission_status(text,uuid,text,timestamptz) to anon, authenticated;

comment on function public.rpc_school_website_list_admissions(text,timestamptz,uuid,integer) is
  'Returns a school-scoped private admission review page only after active session and website.manage permission validation.';
comment on function public.rpc_school_website_update_admission_status(text,uuid,text,timestamptz) is
  'Performs optimistic, school-scoped admission status transitions and audits status changes; never creates Student Core rows.';
