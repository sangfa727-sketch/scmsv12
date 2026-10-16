-- Forward-only repair for confirmed Production security drift.
-- This migration intentionally touches only the currently verified broken surfaces:
-- (1) browser grants on internal tables, (2) Parent Login RPC payload/grants,
-- (3) bounded Parent Login rate limiting, and (4) trusted student-photo upload authorization.
-- It does NOT make student-photos private because existing UI consumes public URLs;
-- that needs a separate URL-consumer migration and compatibility rollout.
-- Do not run the full historical backlog with db push until migration history is reconciled.

BEGIN;

-- 1) Browser roles must not mutate internal session/audit/automation state directly.
REVOKE ALL PRIVILEGES ON TABLE
  public.app_sessions,
  public.audit_log,
  public.n8n_state
FROM anon, authenticated;

-- 2) Return an explicit allowlist from Parent Login, never the full students row.
CREATE OR REPLACE FUNCTION public.rpc_parent_google_login(
  p_qr_token text,
  p_google_email text,
  p_device_ua text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_student record;
  v_token text;
BEGIN
  IF p_qr_token IS NULL OR p_google_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_params');
  END IF;

  SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,
         st.parent_email, st.school_id, st.status, sc.school_name
    INTO v_student
    FROM public.students st
    JOIN public.schools sc
      ON sc.school_id = st.school_id
     AND sc.status = 'active'
   WHERE st.qr_token = p_qr_token
     AND st.status = 'Active';

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_inactive');
  END IF;

  IF v_student.parent_email IS NULL OR trim(v_student.parent_email) = ''
     OR lower(trim(v_student.parent_email)) <> lower(trim(p_google_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.parent_sessions
    (session_token, student_id, school_id, parent_email, device_ua)
  VALUES
    (v_token, v_student.student_id, v_student.school_id,
     lower(trim(p_google_email)), left(p_device_ua, 512));

  RETURN jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'student', jsonb_strip_nulls(jsonb_build_object(
      'student_id', v_student.student_id,
      'name_en', v_student.name_en,
      'name_local', v_student.name_local,
      'class', v_student.class,
      'photo_url', v_student.photo_url,
      'school_name', v_student.school_name
    ))
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_parent_google_login(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_parent_google_login(text, text, text)
  TO service_role;

-- Parent Portal dashboard and leave-request RPCs return only UI-required fields.
CREATE OR REPLACE FUNCTION public.rpc_parent_get_dashboard(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess             record;
  v_student          record;
  v_attendance       jsonb;
  v_grades           jsonb;
  v_invoices         jsonb;
  v_upcoming_exams   jsonb;
  v_leave_requests   jsonb;
  v_parent_messages  jsonb;
  v_timetable        jsonb;
  v_events           jsonb;
BEGIN
  SELECT * INTO v_sess
    FROM public.parent_sessions
   WHERE session_token = p_session_token
     AND expires_at > now();

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  UPDATE public.parent_sessions
     SET last_seen_at = now()
   WHERE session_token = p_session_token;

  SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,
         st.school_id, sc.school_name
    INTO v_student
    FROM public.students st
    JOIN public.schools sc
      ON sc.school_id = st.school_id
     AND sc.status = 'active'
   WHERE st.student_id = v_sess.student_id
     AND st.school_id = v_sess.school_id
     AND st.status = 'Active';

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('date', a.date, 'status', a.status)
           ORDER BY a.date DESC
         ), '[]'::jsonb)
    INTO v_attendance
    FROM (
      SELECT date, status
        FROM public.attendance
       WHERE student_id = v_sess.student_id
         AND school_id = v_student.school_id
       ORDER BY date DESC
    ) a;

  -- Preserve complete historical attendance/grade rows for compatibility.
  -- Payload minimization is done by selecting only UI-required fields; caps are
  -- reserved for future-facing/structural collections below.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'subject', x.subject_name,
             'assessment', x.title,
             'percentage', x.percentage,
             'letter_grade', x.letter_grade,
             'date', x.date
           )
           ORDER BY x.date DESC
         ), '[]'::jsonb)
    INTO v_grades
    FROM (
      SELECT sub.subject_name, asmt.title, g.percentage, g.letter_grade, asmt.date
        FROM public.grades g
        JOIN public.assessments asmt ON asmt.id = g.assessment_id
        JOIN public.subjects sub ON sub.id = asmt.subject_id
       WHERE g.student_id = v_sess.student_id
         AND g.school_id = v_student.school_id
       ORDER BY asmt.date DESC
    ) x;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'subject', x.subject_name,
             'title', x.title,
             'date', x.date,
             'start_time', x.start_time,
             'end_time', x.end_time
           )
           ORDER BY x.date ASC, x.start_time ASC NULLS LAST, x.id ASC
         ), '[]'::jsonb)
    INTO v_upcoming_exams
    FROM (
      SELECT sub.subject_name, asmt.title, asmt.date, asmt.start_time, asmt.end_time, asmt.id
        FROM public.assessments asmt
        JOIN public.subjects sub ON sub.id = asmt.subject_id
       WHERE asmt.school_id = v_student.school_id
         AND asmt.class = v_student.class
         AND asmt.date >= current_date
       ORDER BY asmt.date ASC, asmt.start_time ASC NULLS LAST, asmt.id ASC
       LIMIT 20
    ) x;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('date', x.date, 'type', x.type, 'message_preview', x.message_preview)
           ORDER BY x.date DESC, x.created_at DESC
         ), '[]'::jsonb)
    INTO v_parent_messages
    FROM (
      SELECT
        pc.date,
        pc.type,
        pc.message_preview,
        pc.created_at
      FROM public.parent_comms pc
      WHERE pc.school_id = v_student.school_id
        AND (
          pc.student_id = v_student.student_id
          OR (
            pc.student_id IS NULL
            AND (pc.class IS NULL OR pc.class = v_student.class)
          )
        )
        AND COALESCE(pc.status, '') <> 'Failed'
      ORDER BY pc.date DESC, pc.created_at DESC
    ) x;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'day', tt.day,
             'start_time', tt.start_time,
             'end_time', tt.end_time,
             'subject', tt.subject,
             'room', tt.room
           )
           ORDER BY tt.day, tt.period
         ), '[]'::jsonb)
    INTO v_timetable
    FROM (
      SELECT tt.day, tt.start_time, tt.end_time, tt.subject, tt.room, tt.period
        FROM public.timetable tt
       WHERE tt.school_id = v_student.school_id
         AND tt.class = v_student.class
       ORDER BY tt.day, tt.period
       LIMIT 100
    ) tt;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'title', x.title,
             'description', x.description,
             'starts_at', x.starts_at
           )
           ORDER BY x.starts_at ASC, x.id ASC
         ), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT e.id, e.title, e.description, e.starts_at
        FROM public.parent_portal_events e
       WHERE e.school_id = v_student.school_id
         AND e.is_published = true
         AND e.starts_at >= now() - interval '1 day'
         AND (
           e.student_id = v_student.student_id
           OR (
             e.student_id IS NULL
             AND (e.class IS NULL OR e.class = v_student.class)
           )
         )
       ORDER BY e.starts_at ASC, e.id ASC
       LIMIT 50
    ) x;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id', x.id,
             'start_date', x.start_date,
             'end_date', x.end_date,
             'reason', x.reason,
             'status', x.status,
             'created_at', x.created_at
           )
           ORDER BY x.created_at DESC
         ), '[]'::jsonb)
    INTO v_leave_requests
    FROM (
      SELECT lr.id, lr.start_date, lr.end_date, lr.reason, lr.status, lr.created_at
        FROM public.leave_requests lr
       WHERE lr.student_id = v_sess.student_id
         AND lr.school_id = v_student.school_id
       ORDER BY lr.created_at DESC
    ) x;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number, 'due_date', i.due_date, 'status', i.status, 'total_amount', i.total_amount, 'paid_amount', i.paid_amount,
             'items', COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object('description', x.description, 'amount', x.amount)
                 ORDER BY x.id
               )
               FROM (
                 SELECT it.id, it.description, it.amount
                   FROM public.invoice_items it
                  WHERE it.invoice_id = i.id
                  ORDER BY it.id
               ) x
             ), '[]'::jsonb),
             'payments', COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object(
                   'payment_date', x.payment_date,
                   'method', x.method,
                   'amount', x.amount
                 )
                 ORDER BY x.payment_date DESC, x.id DESC
               )
               FROM (
                 SELECT p.id, p.payment_date, p.method, p.amount
                   FROM public.payments p
                  WHERE p.invoice_id = i.id
                  ORDER BY p.payment_date DESC, p.id DESC
               ) x
             ), '[]'::jsonb)
           )
           ORDER BY i.id DESC
         ), '[]'::jsonb)
    INTO v_invoices
    FROM (
      SELECT i.*
        FROM public.invoices i
       WHERE i.student_id = v_sess.student_id
         AND i.school_id = v_student.school_id
       ORDER BY i.id DESC
    ) i;

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_strip_nulls(jsonb_build_object('student_id', v_student.student_id, 'name_en', v_student.name_en, 'name_local', v_student.name_local, 'class', v_student.class, 'photo_url', v_student.photo_url, 'school_name', v_student.school_name)),
    'attendance', v_attendance,
    'grades', v_grades,
    'upcoming_exams', v_upcoming_exams,
    'parent_messages', v_parent_messages,
    'timetable', v_timetable,
    'events', v_events,
    'leave_requests', v_leave_requests,
    'invoices', v_invoices
  );
END
$function$
;


CREATE OR REPLACE FUNCTION public.rpc_parent_submit_leave_request(
  p_session_token text,
  p_start_date date,
  p_end_date date,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_row RECORD;
BEGIN
  SELECT ps.student_id, ps.school_id, s.class
    INTO v_sess
    FROM public.parent_sessions AS ps
    JOIN public.students AS s
      ON s.student_id = ps.student_id
     AND s.school_id = ps.school_id
     AND s.status = 'Active'
    JOIN public.schools AS sc
      ON sc.school_id = s.school_id
     AND sc.status = 'active'
   WHERE ps.session_token = p_session_token
     AND ps.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_date_range');
  END IF;
  IF p_reason IS NULL OR nullif(trim(p_reason), '') IS NULL OR length(p_reason) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reason');
  END IF;

  UPDATE public.parent_sessions
     SET last_seen_at = now()
   WHERE session_token = p_session_token;

  INSERT INTO public.leave_requests
    (school_id, student_id, class, start_date, end_date, reason)
  VALUES
    (v_sess.school_id, v_sess.student_id, v_sess.class, p_start_date, p_end_date, trim(p_reason))
  RETURNING id, school_id, student_id, start_date, end_date, reason, status, created_at
       INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id', v_row.id,
      'start_date', v_row.start_date,
      'end_date', v_row.end_date,
      'reason', v_row.reason,
      'status', v_row.status,
      'created_at', v_row.created_at
    )
  );
END
$function$;



-- 2b) Keep parent contact values out of the append-only audit log while preserving
-- the existing RPC response contract consumed by the student editor.
CREATE OR REPLACE FUNCTION public.rpc_update_student_parent(
  p_session_token text,
  p_student_id text,
  p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL,
  p_parent_phone2 text DEFAULT NULL,
  p_parent_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_before public.students%ROWTYPE;
  v_row public.students%ROWTYPE;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND lower(t.status) = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND lower(sc.status) = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF private.web_has_student_permission(
    p_session_token, 'students.edit', p_student_id
  ) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT st.* INTO v_before
    FROM public.students AS st
   WHERE st.student_id = p_student_id
     AND st.school_id = v_sess.school_id
   FOR UPDATE;

  IF v_before IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  UPDATE public.students AS st
     SET parent_name = nullif(trim(coalesce(p_parent_name, '')), ''),
         parent_phone = nullif(trim(coalesce(p_parent_phone, '')), ''),
         parent_phone2 = nullif(trim(coalesce(p_parent_phone2, '')), ''),
         parent_email = nullif(lower(trim(coalesce(p_parent_email, ''))), ''),
         updated_at = now()
   WHERE st.student_id = p_student_id
     AND st.school_id = v_sess.school_id
  RETURNING st.* INTO v_row;

  IF v_row.parent_name IS DISTINCT FROM v_before.parent_name THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_name');
  END IF;
  IF v_row.parent_phone IS DISTINCT FROM v_before.parent_phone THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_phone');
  END IF;
  IF v_row.parent_phone2 IS DISTINCT FROM v_before.parent_phone2 THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_phone2');
  END IF;
  IF v_row.parent_email IS DISTINCT FROM v_before.parent_email THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_email');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_sess.teacher_id, 'student.parent.update', v_sess.school_id,
    jsonb_build_object(
      'student_id', v_row.student_id,
      'changed_fields', to_jsonb(v_changed_fields)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', v_row.student_id,
    'parent_name', v_row.parent_name,
    'parent_phone', v_row.parent_phone,
    'parent_phone2', v_row.parent_phone2,
    'parent_email', v_row.parent_email,
    'parent_tg_id', v_row.parent_tg_id
  );
END;
$function$;

-- 2c) Legacy web student delete is a soft delete, but only an authorized
-- current-school admin may perform it. NULL permission results fail closed.
CREATE OR REPLACE FUNCTION public.rpc_delete_student(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_deleted_student_id text;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND lower(t.status) = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND lower(sc.status) = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF v_sess.role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  IF private.web_has_student_permission(
    p_session_token, 'students.edit', p_student_id
  ) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  UPDATE public.students
     SET status = 'Inactive',
         updated_at = now()
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id
  RETURNING student_id INTO v_deleted_student_id;

  IF v_deleted_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_sess.teacher_id, 'student.delete', v_sess.school_id,
    jsonb_build_object('student_id', v_deleted_student_id)
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;



-- 2d) Minimize the six legacy manual student CRUD response payloads.
-- Fail closed if the expected function response patterns have drifted; do not
-- silently report success after changing fewer functions than intended.
DO $harden_student_responses$
DECLARE
  r RECORD;
  d TEXT;
  newd TEXT;
  v_covered INTEGER := 0;
  v_expected CONSTANT INTEGER := 6;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'rpc_register_student',
         'rpc_update_student',
         'rpc_activate_student',
         'rpc_deactivate_student',
         'rpc_reactivate_student',
         'rpc_convert_admission_to_student'
       )
  LOOP
    d := r.definition;
    IF r.proname = 'rpc_convert_admission_to_student' THEN
      newd := regexp_replace(
        d,
        'RETURN jsonb_build_object\(\s*''ok''\s*,\s*true\s*,\s*''student''\s*,\s*to_jsonb\(v_student\)\s*,\s*''admission''\s*,\s*to_jsonb\(v_adm\)\s*\);',
        'RETURN jsonb_build_object(''ok'', true, ''student'', jsonb_build_object(''student_id'', v_student.student_id, ''name_mm'', v_student.name_mm, ''name_en'', v_student.name_en, ''name_local'', v_student.name_local, ''class'', v_student.class, ''grade'', v_student.grade, ''gender'', v_student.gender, ''date_of_birth'', v_student.date_of_birth, ''status'', v_student.status, ''photo_url'', v_student.photo_url, ''house'', v_student.house, ''home_color'', v_student.home_color, ''parent_name'', v_student.parent_name, ''parent_phone'', v_student.parent_phone, ''parent_phone2'', v_student.parent_phone2, ''parent_email'', v_student.parent_email, ''enrollment_date'', v_student.enrollment_date), ''admission'', jsonb_build_object(''id'', v_adm.id, ''status'', v_adm.status, ''converted_student_id'', v_adm.converted_student_id));',
        'gi'
      );
    ELSE
      newd := regexp_replace(
        d,
        'RETURN jsonb_build_object\(\s*''ok''\s*,\s*true\s*,\s*''student''\s*,\s*to_jsonb\(v_row\)\s*\);',
        'RETURN jsonb_build_object(''ok'', true, ''student'', jsonb_build_object(''student_id'', v_row.student_id, ''name_mm'', v_row.name_mm, ''name_en'', v_row.name_en, ''name_local'', v_row.name_local, ''class'', v_row.class, ''grade'', v_row.grade, ''gender'', v_row.gender, ''date_of_birth'', v_row.date_of_birth, ''status'', v_row.status, ''photo_url'', v_row.photo_url, ''house'', v_row.house, ''home_color'', v_row.home_color, ''parent_name'', v_row.parent_name, ''parent_phone'', v_row.parent_phone, ''parent_phone2'', v_row.parent_phone2, ''parent_email'', v_row.parent_email, ''enrollment_date'', v_row.enrollment_date));',
        'gi'
      );
    END IF;

    IF newd <> d THEN
      EXECUTE newd;
      v_covered := v_covered + 1;
    ELSIF (
      r.proname = 'rpc_convert_admission_to_student'
      AND position('to_jsonb(v_student)' in lower(d)) = 0
      AND position('to_jsonb(v_adm)' in lower(d)) = 0
    ) OR (
      r.proname <> 'rpc_convert_admission_to_student'
      AND position('to_jsonb(v_row)' in lower(d)) = 0
    ) THEN
      -- Treat an already-minimized definition as covered on safe re-runs.
      v_covered := v_covered + 1;
    END IF;
  END LOOP;

  IF v_covered <> v_expected THEN
    RAISE EXCEPTION
      'student mutation response hardening coverage mismatch: covered %, expected %',
      v_covered, v_expected;
  END IF;
END;
$harden_student_responses$;

-- 2e) Remove parent contact values from the general student-update audit event.
-- Keep student_id and field names for auditability, never the submitted PII values.
DO $minimize_student_update_audit$
DECLARE
  d TEXT;
  newd TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'rpc_update_student'
   LIMIT 1;

  IF d IS NULL THEN
    RAISE EXCEPTION 'rpc_update_student is missing; refusing partial student response repair';
  END IF;

  newd := regexp_replace(
    d,
    'jsonb_build_object\(\s*''student_id''\s*,\s*v_row\.student_id\s*,\s*''name_en''\s*,\s*v_row\.name_en\s*,\s*''class''\s*,\s*v_row\.class\s*,\s*''grade''\s*,\s*v_row\.grade\s*,\s*''parent_name''\s*,\s*v_row\.parent_name\s*,\s*''parent_phone''\s*,\s*v_row\.parent_phone\s*,\s*''parent_email''\s*,\s*v_row\.parent_email\s*\)',
    'jsonb_build_object(''student_id'', v_row.student_id, ''submitted_fields'', jsonb_build_array(''name_en'', ''class'', ''grade'', ''parent_name'', ''parent_phone'', ''parent_email''))',
    'gi'
  );

  IF newd = d THEN
    IF position('submitted_fields' in d) = 0 THEN
      RAISE EXCEPTION 'rpc_update_student audit payload pattern did not match; refusing partial audit repair';
    END IF;
  ELSE
    EXECUTE newd;
  END IF;
END;
$minimize_student_update_audit$;

-- 3) Atomic, hashed-key rate limiter required by the hardened Parent Login Edge Function.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.parent_login_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parent_login_rate_limits_updated_at_idx
  ON private.parent_login_rate_limits (updated_at);

REVOKE ALL ON TABLE private.parent_login_rate_limits
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_parent_login_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_attempts integer;
  v_window_started_at timestamptz;
  v_retry_after integer;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$'
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
     OR p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 1000 THEN
    RAISE EXCEPTION 'invalid rate-limit parameters' USING ERRCODE = '22023';
  END IF;

  WITH stale_keys AS (
    SELECT key_hash
      FROM private.parent_login_rate_limits
     WHERE updated_at < now() - interval '24 hours'
     ORDER BY updated_at
     LIMIT 1000
  )
  DELETE FROM private.parent_login_rate_limits AS limits
   USING stale_keys
   WHERE limits.key_hash = stale_keys.key_hash;

  INSERT INTO private.parent_login_rate_limits AS current_limit
    (key_hash, window_started_at, attempts, updated_at)
  VALUES (p_key_hash, now(), 1, now())
  ON CONFLICT (key_hash) DO UPDATE
    SET window_started_at = CASE
          WHEN current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN now()
          ELSE current_limit.window_started_at
        END,
        attempts = CASE
          WHEN current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN 1
          ELSE current_limit.attempts + 1
        END,
        updated_at = now()
  RETURNING current_limit.attempts, current_limit.window_started_at
    INTO v_attempts, v_window_started_at;

  v_retry_after := GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (
      v_window_started_at + make_interval(secs => p_window_seconds) - now()
    )))::integer
  );

  RETURN jsonb_build_object(
    'allowed', v_attempts <= p_max_attempts,
    'attempts', v_attempts,
    'retry_after_seconds', v_retry_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_parent_login_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_parent_login_rate_limit(text, integer, integer)
  TO service_role;

-- 4) Student photos may be uploaded only through the trusted Edge Function.
CREATE OR REPLACE FUNCTION public.rpc_authorize_student_photo_upload(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_student RECORD;
  v_session_type text;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND lower(t.status) = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND lower(sc.status) = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NOT NULL THEN
    v_session_type := 'web';
  ELSE
    SELECT t.teacher_id, t.school_id, t.role
      INTO v_sess
      FROM public.app_sessions AS a
      JOIN public.teachers AS t
        ON t.teacher_id = a.teacher_id
       AND t.school_id = a.school_id
       AND t.telegram_id = a.telegram_id
       AND lower(t.status) = 'active'
      JOIN public.schools AS sc
        ON sc.school_id = t.school_id
       AND lower(sc.status) = 'active'
     WHERE a.token = p_session_token
       AND a.status = 'linked'
       AND length(a.token) >= 32
     LIMIT 1;

    IF v_sess IS NOT NULL THEN
      v_session_type := 'telegram';
    END IF;
  END IF;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  SELECT s.student_id
    INTO v_student
    FROM public.students AS s
   WHERE s.student_id = p_student_id
     AND s.school_id = v_sess.school_id
   LIMIT 1;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_not_found');
  END IF;

  IF v_session_type = 'web' THEN
    IF private.web_has_student_permission(
      p_session_token, 'students.edit', p_student_id
    ) IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
    END IF;
  ELSIF v_sess.role NOT IN (
    'admin', 'super_admin', 'school_coordinator', 'administrative_assistant'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'school_id', v_sess.school_id,
    'student_id', v_student.student_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  TO service_role;

DROP POLICY IF EXISTS "anon upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "public read student photos" ON storage.objects;

COMMIT;
