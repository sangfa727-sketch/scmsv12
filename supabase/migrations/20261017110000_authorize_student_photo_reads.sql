-- Authorize private student-photo reads for staff and the linked parent only.
-- Storage remains publicly readable until every UI consumer has moved to signed URLs.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_authorize_student_photo_read(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_web record;
  v_native record;
  v_parent record;
  v_student record;
  v_path text;
BEGIN
  IF nullif(trim(p_session_token), '') IS NULL
     OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_params');
  END IF;

  -- Parent Portal sessions may read only their own linked student's photo.
  SELECT ps.student_id, ps.school_id
    INTO v_parent
    FROM public.parent_sessions ps
    JOIN public.schools sc
      ON sc.school_id = ps.school_id AND lower(sc.status) = 'active'
   WHERE ps.session_token = p_session_token
     AND ps.student_id = p_student_id
     AND ps.expires_at > now()
   LIMIT 1;

  IF v_parent IS NOT NULL THEN
    SELECT s.student_id, s.school_id, s.photo_url
      INTO v_student
      FROM public.students s
     WHERE s.student_id = v_parent.student_id
       AND s.school_id = v_parent.school_id
       AND s.status = 'Active'
     LIMIT 1;
  ELSE
    -- Web staff session: enforce active identity, school membership and view permission.
    SELECT ws.teacher_id, ws.school_id, ws.role
      INTO v_web
      FROM public.app_web_sessions ws
      JOIN public.teachers t
        ON t.teacher_id = ws.teacher_id
       AND t.school_id = ws.school_id
       AND t.role = ws.role
       AND lower(t.status) = 'active'
      JOIN public.schools sc
        ON sc.school_id = t.school_id AND lower(sc.status) = 'active'
     WHERE ws.session_token = p_session_token
       AND ws.expires_at > now()
     LIMIT 1;

    IF v_web IS NOT NULL THEN
      SELECT s.student_id, s.school_id, s.photo_url
        INTO v_student
        FROM public.students s
       WHERE s.student_id = p_student_id
         AND s.school_id = v_web.school_id
         AND s.status = 'Active'
       LIMIT 1;

      IF v_student IS NOT NULL
         AND private.web_has_student_permission(p_session_token, 'students.view', p_student_id) IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
      END IF;
    ELSE
      -- Native/TWA session: bind the current teacher identity and active school.
      SELECT t.teacher_id, t.school_id, t.role
        INTO v_native
        FROM public.app_sessions a
        JOIN public.teachers t
          ON t.teacher_id = a.teacher_id
         AND t.school_id = a.school_id
         AND t.telegram_id = a.telegram_id
         AND lower(t.status) = 'active'
        JOIN public.schools sc
          ON sc.school_id = t.school_id AND lower(sc.status) = 'active'
       WHERE a.token = p_session_token
         AND a.status = 'linked'
         AND length(a.token) >= 32
       LIMIT 1;

      IF v_native IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_session_or_permission_denied');
      END IF;

      SELECT s.student_id, s.school_id, s.photo_url, s.class
        INTO v_student
        FROM public.students s
       WHERE s.student_id = p_student_id
         AND s.school_id = v_native.school_id
         AND s.status = 'Active'
       LIMIT 1;

      -- Match native/TWA roster visibility: administrators may view the whole
      -- school, while teacher-like roles may view only actively assigned classes.
      -- Photo reads must not be stricter than legitimate roster reads, nor wider.
      IF v_student IS NOT NULL
         AND coalesce(lower(v_native.role), '') NOT IN (
           'admin', 'super_admin', 'school_coordinator', 'administrative_assistant', 'principal', 'ht'
         )
         AND (
           coalesce(lower(v_native.role), '') NOT IN ('teacher', 'senior_teacher', 'assistant_teacher')
           OR NOT EXISTS (
             SELECT 1
               FROM public.teacher_class_assignments a
              WHERE a.school_id = v_native.school_id
                AND a.teacher_id = v_native.teacher_id
                AND a.class_name = trim(v_student.class)
                AND a.is_active = true
           )
         ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
      END IF;
    END IF;
  END IF;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_not_found');
  END IF;

  -- Accept only this bucket's canonical public URL and only paths under the
  -- student's own school prefix. Never sign arbitrary URLs or object paths.
  v_path := substring(v_student.photo_url
    from '/storage/v1/object/public/student-photos/([^?]+)');
  IF v_path IS NULL
     OR left(v_path, length(v_student.school_id::text) + 1) <> v_student.school_id::text || '/'
     OR position('..' in v_path) > 0
     OR position(chr(92) in v_path) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'photo_not_available');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', v_student.student_id,
    'school_id', v_student.school_id,
    'object_path', v_path
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_authorize_student_photo_read(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_authorize_student_photo_read(text, text)
  TO service_role;

COMMIT;
