-- Minimize parent portal responses to fields consumed by the portal UI.
-- No data changes; CREATE OR REPLACE preserves existing function grants.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_parent_google_login(p_qr_token text, p_google_email text, p_device_ua text DEFAULT NULL::text)
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
  INSERT INTO public.parent_sessions (session_token, student_id, school_id, parent_email, device_ua)
  VALUES (v_token, v_student.student_id, v_student.school_id, lower(trim(p_google_email)), p_device_ua);

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
       LIMIT 30
    ) a;

  -- LIMIT must apply to source rows before aggregation; LIMIT after jsonb_agg
  -- only limits the single aggregate result row and does not bound the payload.
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
       LIMIT 50
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
      LIMIT 50
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
       LIMIT 20
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
                  LIMIT 100
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
                  LIMIT 100
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
       LIMIT 50
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

COMMIT;
