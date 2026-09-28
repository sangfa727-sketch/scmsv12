-- Bind school configuration writes to the current teacher role/tenant.
-- rpc_set_school_branding intentionally permits only branding keys.
-- rpc_update_school_config_web permits only the established school settings keys.

create or replace function public.rpc_set_school_branding(p_session_token text,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_clean jsonb := '{}'::jsonb; v_cfg jsonb;
begin
  select s.teacher_id,s.school_id,t.role into v_sess
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
     and s.school_id=t.school_id and s.role=t.role limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if v_sess.role not in ('admin','super_admin') then return jsonb_build_object('ok',false,'error','admin_only'); end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then return jsonb_build_object('ok',false,'error','bad_patch'); end if;
  if p_patch ? 'school_logo' then v_clean:=v_clean||jsonb_build_object('school_logo',p_patch->'school_logo'); end if;
  if p_patch ? 'school_cover' then v_clean:=v_clean||jsonb_build_object('school_cover',p_patch->'school_cover'); end if;
  update public.schools set config_json=coalesce(config_json,'{}'::jsonb)||v_clean,updated_at=now()
   where school_id=v_sess.school_id returning config_json into v_cfg;
  return jsonb_build_object('ok',true,'school_logo',coalesce(v_cfg->>'school_logo',''),'school_cover',coalesce(v_cfg->>'school_cover',''));
end;
$function$;

create or replace function public.rpc_update_school_config_web(p_session_token text,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record; v_clean jsonb := '{}'::jsonb;
begin
  select s.teacher_id,s.school_id,t.role into v_sess
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
     and s.school_id=t.school_id and s.role=t.role limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if v_sess.role not in ('admin','super_admin') then return jsonb_build_object('ok',false,'error','admin_only'); end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then return jsonb_build_object('ok',false,'error','bad_patch'); end if;
  if p_patch ? 'classes' then v_clean:=v_clean||jsonb_build_object('classes',p_patch->'classes'); end if;
  if p_patch ? 'grades' then v_clean:=v_clean||jsonb_build_object('grades',p_patch->'grades'); end if;
  if p_patch ? 'subjects' then v_clean:=v_clean||jsonb_build_object('subjects',p_patch->'subjects'); end if;
  if p_patch ? 'school_logo' then v_clean:=v_clean||jsonb_build_object('school_logo',p_patch->'school_logo'); end if;
  if p_patch ? 'school_cover' then v_clean:=v_clean||jsonb_build_object('school_cover',p_patch->'school_cover'); end if;
  update public.schools set config_json=coalesce(config_json,'{}'::jsonb)||v_clean,updated_at=now()
   where school_id=v_sess.school_id returning * into v_row;
  return jsonb_build_object('ok',true,'school',row_to_json(v_row));
end;
$function$;
