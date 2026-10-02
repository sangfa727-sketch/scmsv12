-- SCMS v12: enforce assessment permissions on grade read/write RPCs.
-- Transaction-validated before merge; no live production change from this file alone.

CREATE OR REPLACE FUNCTION public.rpc_get_grades(
  p_session_token text,
  p_assessment_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sess record;
  v_assessment record;
  v_rows jsonb;
begin
  select s.teacher_id, s.school_id, s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  select *
    into v_assessment
    from public.assessments
   where id = p_assessment_id
     and school_id = v_sess.school_id;

  if v_assessment is null then
    return jsonb_build_object('ok', false, 'error', 'assessment_not_found');
  end if;

  if not private.web_has_permission(
    p_session_token,
    'assessment.view',
    v_assessment.class,
    v_assessment.subject_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    into v_rows
    from (
      select g.*
        from public.grades g
       where g.school_id = v_sess.school_id
         and g.assessment_id = p_assessment_id
    ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_save_grades(
  p_session_token text,
  p_assessment_id bigint,
  p_records jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  a record;
  r jsonb;
  sid text;
  score numeric;
  pct numeric;
  letter text;
  n int := 0;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT *
    INTO a
    FROM public.assessments
   WHERE id = p_assessment_id
     AND school_id = v_sess.school_id;

  IF a IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assessment_not_found');
  END IF;

  IF NOT private.web_has_permission(
    p_session_token,
    'assessment.edit',
    a.class,
    a.subject_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_records IS NULL
     OR jsonb_typeof(p_records) <> 'array'
     OR jsonb_array_length(p_records) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'records_must_be_nonempty_array');
  END IF;

  IF (select count(*) from jsonb_array_elements(p_records))
     <> (select count(distinct r->>'student_id') from jsonb_array_elements(p_records) r) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_student_records');
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_records) LOOP
    sid := nullif(trim(r->>'student_id'), '');
    IF sid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
    END IF;

    IF NOT EXISTS (
      select 1
        from public.students
       where student_id = sid
         and school_id = v_sess.school_id
         and class = a.class
         and status = 'Active'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'student_not_in_assessment_class',
        'student_id', sid
      );
    END IF;

    BEGIN
      score := nullif(r->>'score', '')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'invalid_score',
          'student_id', sid
        );
    END;

    IF score IS NOT NULL AND (score < 0 OR score > a.max_score) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'score_out_of_range',
        'student_id', sid
      );
    END IF;

    IF char_length(coalesce(r->>'comment', '')) > 500 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'comment_too_long',
        'student_id', sid
      );
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(p_records) LOOP
    sid := trim(r->>'student_id');
    score := nullif(r->>'score', '')::numeric;

    IF score IS NULL OR a.max_score IS NULL OR a.max_score = 0 THEN
      pct := NULL;
    ELSE
      pct := round((score / a.max_score) * 100, 1);
    END IF;

    letter := public._grade_letter(v_sess.school_id, pct);

    INSERT INTO public.grades(
      school_id, assessment_id, student_id, score, percentage,
      letter_grade, comment, graded_by, graded_at
    )
    VALUES(
      v_sess.school_id, p_assessment_id, sid, score, pct,
      letter, nullif(r->>'comment', ''), v_sess.teacher_id, now()
    )
    ON CONFLICT(assessment_id, student_id)
    DO UPDATE SET
      score = excluded.score,
      percentage = excluded.percentage,
      letter_grade = excluded.letter_grade,
      comment = excluded.comment,
      graded_by = excluded.graded_by,
      graded_at = now();

    n := n + 1;
  END LOOP;

  INSERT INTO public.audit_log(
    source, actor, action, school_id, payload
  )
  VALUES(
    'web', v_sess.teacher_id, 'grades.save', v_sess.school_id,
    jsonb_build_object(
      'assessment_id', p_assessment_id,
      'count', n
    )
  );

  RETURN jsonb_build_object('ok', true, 'count', n);
END;
$function$;
