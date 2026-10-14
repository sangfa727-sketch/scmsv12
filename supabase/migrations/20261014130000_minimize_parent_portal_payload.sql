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

  SELECT student_id, name_en, name_local, class, photo_url, parent_email, school_id, status
    INTO v_student
    FROM public.students
   WHERE qr_token = p_qr_token
     AND status = 'Active';

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
      'photo_url', v_student.photo_url
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

  SELECT student_id, name_en, name_local, class, photo_url, school_id
    INTO v_student
    FROM public.students
   WHERE student_id = v_sess.student_id
     AND school_id = v_sess.school_id;

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
       ORDER BY date DESC
       LIMIT 30
    ) a;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'subject', sub.subject_name,
             'assessment', asmt.title,
             'percentage', g.percentage,
             'letter_grade', g.letter_grade,
             'date', asmt.date
           )
           ORDER BY asmt.date DESC
         ), '[]'::jsonb)
    INTO v_grades
    FROM public.grades g
    JOIN public.assessments asmt ON asmt.id = g.assessment_id
    JOIN public.subjects sub ON sub.id = asmt.subject_id
   WHERE g.student_id = v_sess.student_id
   LIMIT 50;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'subject', sub.subject_name,
             'title', asmt.title,
             'date', asmt.date,
             'start_time', asmt.start_time,
             'end_time', asmt.end_time
           )
           ORDER BY asmt.date ASC, asmt.start_time ASC NULLS LAST, asmt.id ASC
         ), '[]'::jsonb)
    INTO v_upcoming_exams
    FROM public.assessments asmt
    JOIN public.subjects sub ON sub.id = asmt.subject_id
   WHERE asmt.school_id = v_student.school_id
     AND asmt.class = v_student.class
     AND asmt.date >= current_date
   LIMIT 20;

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
    FROM public.timetable tt
   WHERE tt.school_id = v_student.school_id
     AND tt.class = v_student.class;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'title', e.title,
             'description', e.description,
             'starts_at', e.starts_at
           )
           ORDER BY e.starts_at ASC, e.id ASC
         ), '[]'::jsonb)
    INTO v_events
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
   LIMIT 50;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id', lr.id,
             'start_date', lr.start_date,
             'end_date', lr.end_date,
             'reason', lr.reason,
             'status', lr.status,
             'created_at', lr.created_at
           )
           ORDER BY lr.created_at DESC
         ), '[]'::jsonb)
    INTO v_leave_requests
    FROM public.leave_requests lr
   WHERE lr.student_id = v_sess.student_id
   LIMIT 20;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number, 'due_date', i.due_date, 'status', i.status, 'total_amount', i.total_amount, 'paid_amount', i.paid_amount,
             'items', COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object('description', it.description, 'amount', it.amount)
                 ORDER BY it.id
               )
               FROM public.invoice_items it
               WHERE it.invoice_id = i.id
             ), '[]'::jsonb),
             'payments', COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object(
                   'payment_date', p.payment_date,
                   'method', p.method,
                   'amount', p.amount
                 )
                 ORDER BY p.payment_date DESC, p.id DESC
               )
               FROM public.payments p
               WHERE p.invoice_id = i.id
             ), '[]'::jsonb)
           )
           ORDER BY i.id DESC
         ), '[]'::jsonb)
    INTO v_invoices
    FROM public.invoices i
   WHERE i.student_id = v_sess.student_id;

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_strip_nulls(jsonb_build_object('student_id', v_student.student_id, 'name_en', v_student.name_en, 'name_local', v_student.name_local, 'class', v_student.class, 'photo_url', v_student.photo_url)),
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

COMMIT;
