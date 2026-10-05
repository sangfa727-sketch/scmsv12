-- SCMS v12 — Health authorization hardening
-- Health data is sensitive: dedicated permissions + student class scope.

insert into public.permission_definitions(permission_key, scope_type, is_active)
values ('health.view','class',true), ('health.edit','class',true)
on conflict (permission_key) do update
set scope_type=excluded.scope_type,is_active=true;

insert into public.role_permissions(role, permission_key, allowed)
select r.role,p.permission_key,true
from (values
 ('teacher'),('assistant_teacher'),('senior_teacher'),
 ('school_coordinator'),('administrative_assistant')
) r(role)
cross join (values ('health.view'),('health.edit')) p(permission_key)
on conflict (role,permission_key) do update set allowed=excluded.allowed;

insert into public.role_permissions(role, permission_key, allowed)
select r.role,p.permission_key,true
from (values ('admin'),('super_admin')) r(role)
cross join (values ('health.view'),('health.edit')) p(permission_key)
on conflict (role,permission_key) do update set allowed=excluded.allowed;

create or replace function public.rpc_get_health_profile(p_session_token text,p_student_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_prof record; v_vaccs jsonb; v_visits jsonb;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s
 join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id limit 1;
 if v_student is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'health.view',nullif(trim(v_student.class),''),null) then
   return jsonb_build_object('ok',false,'error','permission_denied');
 end if;
 select blood_type,allergies,medical_conditions,medications,emergency_contact_name,emergency_contact_phone,
        emergency_contact_relation,doctor_name,doctor_phone,notes into v_prof
 from public.student_health_profiles where student_id=p_student_id and school_id=v_sess.school_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'vaccine_name',i.vaccine_name,'dose_number',i.dose_number,
   'date_given',i.date_given,'notes',i.notes) order by i.date_given desc nulls last,i.id desc),'[]'::jsonb)
 into v_vaccs from public.immunizations i where i.student_id=p_student_id and i.school_id=v_sess.school_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name_en',h.name_en,'class',h.class,'date',h.date,
   'reason',h.reason,'treatment',h.treatment,'notes',h.notes) order by h.date desc,h.id desc),'[]'::jsonb)
 into v_visits from public.health_visits h where h.student_id=p_student_id and h.school_id=v_sess.school_id;
 return jsonb_build_object('ok',true,'profile',coalesce(to_jsonb(v_prof),'{}'::jsonb),'vaccinations',v_vaccs,'visits',v_visits);
end;$function$;

create or replace function public.rpc_upsert_health_profile(p_session_token text,p_student_id text,p_blood_type text default null,
 p_allergies text default null,p_medical_conditions text default null,p_medications text default null,
 p_emergency_contact_name text default null,p_emergency_contact_phone text default null,p_doctor_name text default null,
 p_doctor_phone text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id limit 1;
 if v_student is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'health.edit',nullif(trim(v_student.class),''),null) then
   return jsonb_build_object('ok',false,'error','permission_denied');
 end if;
 insert into public.student_health_profiles(student_id,school_id,blood_type,allergies,medical_conditions,medications,
 emergency_contact_name,emergency_contact_phone,doctor_name,doctor_phone,notes,updated_by)
 values(p_student_id,v_sess.school_id,nullif(trim(p_blood_type),''),nullif(trim(p_allergies),''),
 nullif(trim(p_medical_conditions),''),nullif(trim(p_medications),''),nullif(trim(p_emergency_contact_name),''),
 nullif(trim(p_emergency_contact_phone),''),nullif(trim(p_doctor_name),''),nullif(trim(p_doctor_phone),''),
 nullif(trim(p_notes),''),v_sess.teacher_id)
 on conflict(student_id) do update set blood_type=excluded.blood_type,allergies=excluded.allergies,
 medical_conditions=excluded.medical_conditions,medications=excluded.medications,
 emergency_contact_name=excluded.emergency_contact_name,emergency_contact_phone=excluded.emergency_contact_phone,
 doctor_name=excluded.doctor_name,doctor_phone=excluded.doctor_phone,notes=excluded.notes,updated_by=excluded.updated_by
 returning * into v_row;
 return jsonb_build_object('ok',true,'profile',jsonb_build_object('student_id',v_row.student_id,'blood_type',v_row.blood_type,
 'allergies',v_row.allergies,'medical_conditions',v_row.medical_conditions,'medications',v_row.medications,
 'emergency_contact_name',v_row.emergency_contact_name,'emergency_contact_phone',v_row.emergency_contact_phone,
 'doctor_name',v_row.doctor_name,'doctor_phone',v_row.doctor_phone,'notes',v_row.notes));
end;$function$;

create or replace function public.rpc_add_vaccination(p_session_token text,p_student_id text,p_vaccine_name text,p_date_given date default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id limit 1;
 if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;
 if not private.web_has_permission(p_session_token,'health.edit',nullif(trim(v_student.class),''),null) then
   return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 if p_vaccine_name is null or trim(p_vaccine_name)='' then return jsonb_build_object('ok',false,'error','vaccine_name_required'); end if;
 insert into public.immunizations(student_id,school_id,vaccine_name,date_given,notes,created_by)
 values(p_student_id,v_sess.school_id,trim(p_vaccine_name),p_date_given,nullif(trim(p_notes),''),v_sess.teacher_id) returning * into v_row;
 return jsonb_build_object('ok',true,'vaccination',to_jsonb(v_row));
end;$function$;

create or replace function public.rpc_add_health_visit(p_session_token text,p_student_id text,p_date date default null,p_reason text default null,p_treatment text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id limit 1;
 if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;
 if not private.web_has_permission(p_session_token,'health.edit',nullif(trim(v_student.class),''),null) then
   return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 if p_reason is null or trim(p_reason)='' then return jsonb_build_object('ok',false,'error','reason_required'); end if;
 insert into public.health_visits(student_id,school_id,date,reason,treatment,notes,created_by)
 values(p_student_id,v_sess.school_id,coalesce(p_date,current_date),trim(p_reason),nullif(trim(p_treatment),''),nullif(trim(p_notes),''),v_sess.teacher_id)
 returning * into v_row;
 return jsonb_build_object('ok',true,'visit',to_jsonb(v_row));
end;$function$;

create or replace function public.rpc_delete_vaccination(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select i.* into v_row from public.immunizations i where i.id=p_id and i.school_id=v_sess.school_id limit 1;
 if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'health.edit',nullif(trim((select s.class from public.students s where s.student_id=v_row.student_id and s.school_id=v_sess.school_id)),''),null) then
   return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 delete from public.immunizations where id=p_id and school_id=v_sess.school_id;
 return jsonb_build_object('ok',true);
end;$function$;

create or replace function public.rpc_delete_health_visit(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select h.* into v_row from public.health_visits h where h.id=p_id and h.school_id=v_sess.school_id limit 1;
 if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'health.edit',nullif(trim((select s.class from public.students s where s.student_id=v_row.student_id and s.school_id=v_sess.school_id)),''),null) then
   return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 delete from public.health_visits where id=p_id and school_id=v_sess.school_id;
 return jsonb_build_object('ok',true);
end;$function$;

revoke execute on function public.rpc_get_health_profile(text,text) from public;
grant execute on function public.rpc_get_health_profile(text,text) to anon,authenticated;
revoke execute on function public.rpc_upsert_health_profile(text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.rpc_upsert_health_profile(text,text,text,text,text,text,text,text,text,text,text) to anon,authenticated;
revoke execute on function public.rpc_add_vaccination(text,text,text,date,text) from public;
grant execute on function public.rpc_add_vaccination(text,text,text,date,text) to anon,authenticated;
revoke execute on function public.rpc_delete_vaccination(text,bigint) from public;
grant execute on function public.rpc_delete_vaccination(text,bigint) to anon,authenticated;
revoke execute on function public.rpc_add_health_visit(text,text,date,text,text,text) from public;
grant execute on function public.rpc_add_health_visit(text,text,date,text,text,text) to anon,authenticated;
revoke execute on function public.rpc_delete_health_visit(text,bigint) from public;
grant execute on function public.rpc_delete_health_visit(text,bigint) to anon,authenticated;
