CREATE OR REPLACE FUNCTION public.rpc_upsert_health_profile(
  p_session_token text,
  p_student_id text,
  p_blood_type text DEFAULT NULL,
  p_allergies text DEFAULT NULL,
  p_medical_conditions text DEFAULT NULL,
  p_medications text DEFAULT NULL,
  p_emergency_contact_name text DEFAULT NULL,
  p_emergency_contact_phone text DEFAULT NULL,
  p_doctor_name text DEFAULT NULL,
  p_doctor_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
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

  IF NOT EXISTS (
    SELECT 1 FROM public.students
     WHERE student_id = p_student_id
       AND school_id = v_sess.school_id
  ) THEN
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
    medical_conditions = EXCLUDED.medications,
    medications = EXCLUDED.medications,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    doctor_name = EXCLUDED.doctor_name,
    doctor_phone = EXCLUDED.doctor_phone,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'student_id', v_row.student_id,
      'blood_type', v_row.blood_type,
      'allergies', v_row.allergies,
      'medical_conditions', v_row.medical_conditions,
      'medications', v_row.medications,
      'emergency_contact_name', v_row.emergency_contact_name,
      'emergency_contact_phone', v_row.emergency_contact_phone,
      'doctor_name', v_row.doctor_name,
      'doctor_phone', v_row.doctor_phone,
      'notes', v_row.notes
    )
  );
END
$function$;
