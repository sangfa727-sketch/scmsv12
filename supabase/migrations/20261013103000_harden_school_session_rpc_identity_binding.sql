-- Defense in depth: sensitive school-scoped RPCs must validate the session
-- against the teacher's CURRENT school and role, not trust stored session claims.
-- This migration is not applied to the live database by this PR.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_get_monthly_summary(p_session_token text, p_year_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  SELECT s.school_id
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

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.class, x.name_en), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT *
        FROM public.monthly_summary
       WHERE school_id = v_sess.school_id
         AND year_month = COALESCE(p_year_month, to_char(current_date, 'YYYY-MM'))
    ) x;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_subjects(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  SELECT s.school_id
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

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.display_order), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT *
        FROM public.subjects
       WHERE school_id = v_sess.school_id
         AND is_active = true
    ) x;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_terms(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  SELECT s.school_id
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

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.term_order), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT *
        FROM public.terms
       WHERE school_id = v_sess.school_id
    ) x;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_set_school_cover(p_session_token text, p_cover_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  SELECT s.school_id, s.role
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

  IF v_sess.role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_only');
  END IF;

  UPDATE public.schools
     SET config_json = COALESCE(config_json, '{}'::jsonb)
                       || jsonb_build_object('school_cover', p_cover_url),
         updated_at = now()
   WHERE school_id = v_sess.school_id
   RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'config', v_row.config_json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_set_school_logo(p_session_token text, p_logo_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  SELECT s.school_id, s.role
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

  IF v_sess.role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_only');
  END IF;

  UPDATE public.schools
     SET config_json = COALESCE(config_json, '{}'::jsonb)
                       || jsonb_build_object('school_logo', p_logo_url),
         updated_at = now()
   WHERE school_id = v_sess.school_id
   RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'config', v_row.config_json);
END;
$function$;

COMMIT;
