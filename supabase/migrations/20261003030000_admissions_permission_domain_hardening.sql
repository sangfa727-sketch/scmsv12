-- Admissions permission domain: admin/super_admin by default, with explicit view/manage keys.
INSERT INTO public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active, display_order)
VALUES
  ('admissions.view', 'Admissions', 'View and inspect admission applications', 'global', true, true, 83),
  ('admissions.manage', 'Admissions', 'Create, edit, transition, delete, convert, and manage admission applications', 'global', true, true, 84)
ON CONFLICT (permission_key) DO UPDATE SET
  category=EXCLUDED.category,
  description=EXCLUDED.description,
  scope_type=EXCLUDED.scope_type,
  is_sensitive=EXCLUDED.is_sensitive,
  is_active=EXCLUDED.is_active,
  display_order=EXCLUDED.display_order;

INSERT INTO public.role_permissions(role, permission_key, allowed)
VALUES
  ('admin','admissions.view',true),
  ('admin','admissions.manage',true),
  ('super_admin','admissions.view',true),
  ('super_admin','admissions.manage',true)
ON CONFLICT (role, permission_key) DO UPDATE SET allowed=EXCLUDED.allowed;

CREATE OR REPLACE FUNCTION public.rpc_convert_admission_to_student(p_session_token text, p_id bigint, p_class text DEFAULT NULL::text, p_home_color text DEFAULT NULL::text, p_status text DEFAULT 'Pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_sess  record;
  v_adm   record;
  v_final_class text;
  v_student_id  text;
  v_student     record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) THEN
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

  SELECT * INTO v_adm FROM public.admissions
   WHERE id = p_id AND school_id = v_sess.school_id;

  IF v_adm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_adm.converted_student_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_converted',
      'existing_student_id', v_adm.converted_student_id);
  END IF;

  v_final_class := COALESCE(nullif(trim(p_class), ''), v_adm.desired_class);
  IF v_final_class IS NULL OR trim(v_final_class) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'class_required');
  END IF;

  v_student_id := 'STU-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4);

  INSERT INTO public.students (
    student_id, school_id, name_local, name_mm, name_en, class,
    gender, date_of_birth, dob, home_color, house_color, house,
    parent_name, parent_phone, parent_email, status, enrollment_date, photo_url
  ) VALUES (
    v_student_id, v_sess.school_id, v_adm.applicant_name_local,
    COALESCE(v_adm.applicant_name_local, v_adm.applicant_name_en), v_adm.applicant_name_en, v_final_class,
    v_adm.gender, v_adm.date_of_birth, v_adm.date_of_birth, p_home_color, p_home_color, p_home_color,
    v_adm.parent_name, v_adm.parent_phone, v_adm.parent_email,
    COALESCE(nullif(trim(p_status), ''), 'Pending'), current_date, v_adm.applicant_photo_url
  )
  RETURNING * INTO v_student;

  UPDATE public.admissions
     SET status = 'Enrolled', converted_student_id = v_student_id
   WHERE id = p_id
   RETURNING * INTO v_adm;

  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_student), 'admission', to_jsonb(v_adm));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_create_admission(p_session_token text, p_applicant_name_en text, p_applicant_name_local text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_gender text DEFAULT NULL::text, p_desired_class text DEFAULT NULL::text, p_parent_name text DEFAULT NULL::text, p_parent_phone text DEFAULT NULL::text, p_parent_email text DEFAULT NULL::text, p_application_date date DEFAULT NULL::date, p_source text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) THEN
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

  IF p_applicant_name_en IS NULL OR trim(p_applicant_name_en) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;

  INSERT INTO public.admissions (
    school_id, applicant_name_en, applicant_name_local, date_of_birth, gender,
    desired_class, parent_name, parent_phone, parent_email,
    application_date, source, notes, created_by
  ) VALUES (
    v_sess.school_id, trim(p_applicant_name_en), nullif(trim(p_applicant_name_local), ''),
    p_date_of_birth, p_gender, nullif(trim(p_desired_class), ''),
    nullif(trim(p_parent_name), ''), nullif(trim(p_parent_phone), ''), nullif(trim(p_parent_email), ''),
    COALESCE(p_application_date, current_date), nullif(trim(p_source), ''), nullif(trim(p_notes), ''),
    v_sess.teacher_id
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'admission', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_admission(p_session_token text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_n    int;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) THEN
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

  DELETE FROM public.admissions WHERE id = p_id AND school_id = v_sess.school_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_admission_detail(p_session_token text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.view', NULL, NULL) THEN
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

  SELECT * INTO v_row FROM public.admissions
   WHERE id = p_id AND school_id = v_sess.school_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'admission', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_admissions(p_session_token text, p_status text DEFAULT NULL::text, p_class text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.view', NULL, NULL) THEN
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

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.application_date DESC, a.id DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.admissions a
   WHERE a.school_id = v_sess.school_id
     AND (p_status IS NULL OR p_status = 'All' OR a.status = p_status)
     AND (p_class  IS NULL OR p_class  = 'All' OR a.desired_class = p_class);

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_link_admission_invoice(p_session_token text, p_id bigint, p_invoice_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_sess record; v_row record; v_inv record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  select s.teacher_id, s.school_id into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and t.role in ('admin','super_admin')
   limit 1;
  if v_sess is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  select * into v_inv from public.invoices where id = p_invoice_id and school_id = v_sess.school_id;
  if v_inv is null then return jsonb_build_object('ok', false, 'error', 'invoice_not_found'); end if;
  update public.admissions set registration_invoice_id = p_invoice_id
   where id = p_id and school_id = v_sess.school_id
   returning * into v_row;
  if v_row is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'admission', to_jsonb(v_row));
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_set_admission_photo(p_session_token text, p_id bigint, p_photo_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) THEN
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

  UPDATE public.admissions
     SET applicant_photo_url = p_photo_url
   WHERE id = p_id AND school_id = v_sess.school_id
   RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'admission', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_update_admission_status(p_session_token text, p_id bigint, p_status text, p_interview_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) THEN
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

  IF p_status IS NULL OR NOT (p_status = ANY (ARRAY[
    'Applied','Interview Scheduled','Interview Done','Accepted','Waitlisted','Rejected','Enrolled','Withdrawn'
  ])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  IF p_status = 'Enrolled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'use_convert_endpoint',
      'message', 'Use rpc_convert_admission_to_student to move an applicant to Enrolled.');
  END IF;

  UPDATE public.admissions SET
    status         = p_status,
    interview_date = COALESCE(p_interview_date, interview_date),
    notes          = COALESCE(nullif(trim(p_notes), ''), notes)
  WHERE id = p_id AND school_id = v_sess.school_id
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'admission', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_update_admission(p_session_token text, p_id bigint, p_applicant_name_en text DEFAULT NULL::text, p_applicant_name_local text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_gender text DEFAULT NULL::text, p_desired_class text DEFAULT NULL::text, p_parent_name text DEFAULT NULL::text, p_parent_phone text DEFAULT NULL::text, p_parent_email text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) THEN
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

  UPDATE public.admissions SET
    applicant_name_en    = COALESCE(nullif(trim(p_applicant_name_en), ''), applicant_name_en),
    applicant_name_local = COALESCE(nullif(trim(p_applicant_name_local), ''), applicant_name_local),
    date_of_birth        = COALESCE(p_date_of_birth, date_of_birth),
    gender               = COALESCE(p_gender, gender),
    desired_class        = COALESCE(nullif(trim(p_desired_class), ''), desired_class),
    parent_name          = COALESCE(nullif(trim(p_parent_name), ''), parent_name),
    parent_phone         = COALESCE(nullif(trim(p_parent_phone), ''), parent_phone),
    parent_email         = COALESCE(nullif(trim(p_parent_email), ''), parent_email),
    source               = COALESCE(nullif(trim(p_source), ''), source),
    notes                = COALESCE(nullif(trim(p_notes), ''), notes)
  WHERE id = p_id AND school_id = v_sess.school_id
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'admission', to_jsonb(v_row));
END $function$;

