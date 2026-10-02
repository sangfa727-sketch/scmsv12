-- Student-domain permission hardening.
-- Enforces the existing students.view / students.edit permission model at the SECURITY DEFINER RPC boundary.

CREATE OR REPLACE FUNCTION public.rpc_activate_student(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_sess record;
  v_cur  text;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT status INTO v_cur FROM public.students
   WHERE student_id = p_student_id AND school_id = v_sess.school_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_cur = 'Pending' AND NOT EXISTS (
       SELECT 1 FROM public.invoices
        WHERE student_id = p_student_id AND school_id = v_sess.school_id AND status = 'Paid') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_fee_not_paid',
                              'message', 'Registration invoice must be Paid before activating this student.');
  END IF;

  UPDATE public.students
     SET status = 'Active',
         qr_token = COALESCE(qr_token, encode(gen_random_bytes(20), 'hex'))
   WHERE student_id = p_student_id AND school_id = v_sess.school_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_add_health_visit(p_session_token text, p_student_id text, p_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_treatment text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_sess record; v_row record; BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF; SELECT s.teacher_id,s.school_id INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1; IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF; IF p_reason IS NULL OR trim(p_reason)='' THEN RETURN jsonb_build_object('ok',false,'error','reason_required'); END IF; IF NOT EXISTS (SELECT 1 FROM public.students WHERE student_id=p_student_id AND school_id=v_sess.school_id) THEN RETURN jsonb_build_object('ok',false,'error','student_not_found'); END IF; INSERT INTO public.health_visits(student_id,school_id,date,reason,treatment,notes,created_by) VALUES(p_student_id,v_sess.school_id,coalesce(p_date,current_date),trim(p_reason),nullif(trim(p_treatment),''),nullif(trim(p_notes),''),v_sess.teacher_id) RETURNING * INTO v_row; RETURN jsonb_build_object('ok',true,'visit',to_jsonb(v_row)); END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_add_vaccination(p_session_token text, p_student_id text, p_vaccine_name text, p_date_given date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_sess record; v_row record; BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF; SELECT s.teacher_id,s.school_id INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1; IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF; IF p_vaccine_name IS NULL OR trim(p_vaccine_name)='' THEN RETURN jsonb_build_object('ok',false,'error','vaccine_name_required'); END IF; IF NOT EXISTS (SELECT 1 FROM public.students WHERE student_id=p_student_id AND school_id=v_sess.school_id) THEN RETURN jsonb_build_object('ok',false,'error','student_not_found'); END IF; INSERT INTO public.immunizations(student_id,school_id,vaccine_name,date_given,notes,created_by) VALUES(p_student_id,v_sess.school_id,trim(p_vaccine_name),p_date_given,nullif(trim(p_notes),''),v_sess.teacher_id) RETURNING * INTO v_row; RETURN jsonb_build_object('ok',true,'vaccination',to_jsonb(v_row)); END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_assign_student_transport(p_session_token text, p_student_id text, p_route_id bigint, p_pickup_stop text DEFAULT NULL::text, p_pickup_time time without time zone DEFAULT NULL::time without time zone, p_dropoff_time time without time zone DEFAULT NULL::time without time zone, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_sess record; v_row record; BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF; SELECT s.teacher_id,s.school_id INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1; IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF; IF NOT EXISTS (SELECT 1 FROM public.students WHERE student_id=p_student_id AND school_id=v_sess.school_id) THEN RETURN jsonb_build_object('ok',false,'error','student_not_found'); END IF; IF NOT EXISTS (SELECT 1 FROM public.transport_routes WHERE id=p_route_id AND school_id=v_sess.school_id) THEN RETURN jsonb_build_object('ok',false,'error','route_not_found'); END IF; INSERT INTO public.student_transport(student_id,school_id,route_id,pickup_stop,pickup_time,dropoff_time,notes) VALUES(p_student_id,v_sess.school_id,p_route_id,nullif(trim(p_pickup_stop),''),p_pickup_time,p_dropoff_time,nullif(trim(p_notes),'')) ON CONFLICT(student_id) DO UPDATE SET route_id=EXCLUDED.route_id,pickup_stop=EXCLUDED.pickup_stop,pickup_time=EXCLUDED.pickup_time,dropoff_time=EXCLUDED.dropoff_time,notes=EXCLUDED.notes RETURNING * INTO v_row; RETURN jsonb_build_object('ok',true,'assignment',to_jsonb(v_row)); END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_deactivate_student(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF COALESCE(v_sess.role, '') NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden',
      'message', 'Only an administrator can deactivate a student.');
  END IF;

  IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  UPDATE public.students
     SET status = 'Inactive',
         updated_at = now()
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id
     AND status = 'Active'
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_active');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web',
    v_sess.teacher_id,
    'student.deactivate',
    v_sess.school_id,
    jsonb_build_object('student_id', p_student_id)
  );

  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_student(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sess  record;
  v_count int;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  select s.teacher_id, s.school_id
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;
  if p_student_id is null or trim(p_student_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'student_id_required');
  end if;

  update public.students
     set status = 'Inactive', updated_at = now()
   where student_id = p_student_id
     and school_id = v_sess.school_id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_health_profile(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess  record;
  v_prof  record;
  v_vaccs jsonb;
  v_visits jsonb;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE student_id = p_student_id AND school_id = v_sess.school_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO v_prof FROM public.student_health_profiles
   WHERE student_id = p_student_id AND school_id = v_sess.school_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.date_given DESC NULLS LAST, i.id DESC), '[]'::jsonb)
    INTO v_vaccs
    FROM public.immunizations i
   WHERE i.student_id = p_student_id AND i.school_id = v_sess.school_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.date DESC, h.id DESC), '[]'::jsonb)
    INTO v_visits
    FROM public.health_visits h
   WHERE h.student_id = p_student_id AND h.school_id = v_sess.school_id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', to_jsonb(v_prof),
    'vaccinations', v_vaccs,
    'visits', v_visits
  );
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_student_by_id(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT * INTO v_row FROM public.students
   WHERE student_id = p_student_id AND school_id = v_sess.school_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_student_checkouts(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'book_id', c.book_id, 'title', b.title,
      'checked_out_date', c.checked_out_date, 'due_date', c.due_date, 'returned_date', c.returned_date
    ) ORDER BY c.checked_out_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.library_checkouts c
    JOIN public.library_books b ON b.id = c.book_id
   WHERE c.student_id = p_student_id AND c.school_id = v_sess.school_id;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_student_history(p_session_token text, p_student_id text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_sess record; v_exists boolean; v_limit integer;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id,s.school_id,s.role INTO v_sess
  FROM public.app_web_sessions s
  JOIN public.teachers t ON t.teacher_id=s.teacher_id
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active'
  LIMIT 1;
  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_student_id IS NULL OR trim(p_student_id)='' THEN RETURN jsonb_build_object('ok',false,'error','student_id_required'); END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.students
    WHERE student_id=p_student_id AND school_id=v_sess.school_id
  ) INTO v_exists;
  IF NOT v_exists THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit,50),1),100);
  RETURN jsonb_build_object(
    'ok',true,
    'history',COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.ts DESC)
      FROM (
        SELECT id,ts,source,actor,action,payload
        FROM public.audit_log
        WHERE school_id=v_sess.school_id
          AND payload->>'student_id'=p_student_id
        ORDER BY ts DESC
        LIMIT v_limit
      ) x
    ),'[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_student_transport(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT stt.*, r.route_name, r.driver_name, r.driver_phone, r.vehicle_info INTO v_row
    FROM public.student_transport stt
    LEFT JOIN public.transport_routes r ON r.id = stt.route_id
   WHERE stt.student_id = p_student_id AND stt.school_id = v_sess.school_id;

  RETURN jsonb_build_object('ok', true, 'assignment', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_reactivate_student(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sess record; v_row record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
 SELECT s.teacher_id,s.school_id,s.role INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id
 WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
 IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF COALESCE(v_sess.role,'') NOT IN ('admin','super_admin') THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
 UPDATE public.students SET status='Active',updated_at=now()
 WHERE student_id=p_student_id AND school_id=v_sess.school_id AND status='Inactive' RETURNING * INTO v_row;
 IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found_or_not_inactive'); END IF;
 INSERT INTO public.audit_log(source,actor,action,school_id,payload) VALUES('web',v_sess.teacher_id,'student.reactivate',v_sess.school_id,jsonb_build_object('student_id',p_student_id));
 RETURN jsonb_build_object('ok',true,'student',to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_remove_student_transport(p_session_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_n    int;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  DELETE FROM public.student_transport WHERE student_id = p_student_id AND school_id = v_sess.school_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_update_student_parent(p_session_token text, p_student_id text, p_parent_name text DEFAULT NULL::text, p_parent_phone text DEFAULT NULL::text, p_parent_phone2 text DEFAULT NULL::text, p_parent_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sess record; v_row record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id,s.school_id,s.role INTO v_sess
  FROM public.app_web_sessions s
  JOIN public.teachers t ON t.teacher_id=s.teacher_id
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active'
  LIMIT 1;

  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_student_id IS NULL OR trim(p_student_id)='' THEN RETURN jsonb_build_object('ok',false,'error','student_id_required'); END IF;

  UPDATE public.students
  SET parent_name=nullif(trim(coalesce(p_parent_name,'')),''),
      parent_phone=nullif(trim(coalesce(p_parent_phone,'')),''),
      parent_phone2=nullif(trim(coalesce(p_parent_phone2,'')),''),
      parent_email=nullif(lower(trim(coalesce(p_parent_email,''))),''),
      updated_at=now()
  WHERE student_id=p_student_id AND school_id=v_sess.school_id
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;

  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES(
    'web',v_sess.teacher_id,'student.parent.update',v_sess.school_id,
    jsonb_build_object(
      'student_id',v_row.student_id,
      'parent_name',v_row.parent_name,
      'parent_phone',v_row.parent_phone,
      'parent_phone2',v_row.parent_phone2,
      'parent_email',v_row.parent_email
    )
  );

  RETURN jsonb_build_object(
    'ok',true,
    'student_id',v_row.student_id,
    'parent_name',v_row.parent_name,
    'parent_phone',v_row.parent_phone,
    'parent_phone2',v_row.parent_phone2,
    'parent_email',v_row.parent_email,
    'parent_tg_id',v_row.parent_tg_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_health_profile(p_session_token text, p_student_id text, p_blood_type text DEFAULT NULL::text, p_allergies text DEFAULT NULL::text, p_medical_conditions text DEFAULT NULL::text, p_medications text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_doctor_name text DEFAULT NULL::text, p_doctor_phone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE student_id = p_student_id AND school_id = v_sess.school_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.student_health_profiles (
    student_id, school_id, blood_type, allergies, medical_conditions, medications,
    emergency_contact_name, emergency_contact_phone, doctor_name, doctor_phone, notes,
    updated_by
  ) VALUES (
    p_student_id, v_sess.school_id, nullif(trim(p_blood_type), ''), nullif(trim(p_allergies), ''),
    nullif(trim(p_medical_conditions), ''), nullif(trim(p_medications), ''),
    nullif(trim(p_emergency_contact_name), ''), nullif(trim(p_emergency_contact_phone), ''),
    nullif(trim(p_doctor_name), ''), nullif(trim(p_doctor_phone), ''), nullif(trim(p_notes), ''),
    v_sess.teacher_id
  )
  ON CONFLICT (student_id) DO UPDATE SET
    blood_type = EXCLUDED.blood_type,
    allergies = EXCLUDED.allergies,
    medical_conditions = EXCLUDED.medical_conditions,
    medications = EXCLUDED.medications,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    doctor_name = EXCLUDED.doctor_name,
    doctor_phone = EXCLUDED.doctor_phone,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'profile', to_jsonb(v_row));
END $function$;

