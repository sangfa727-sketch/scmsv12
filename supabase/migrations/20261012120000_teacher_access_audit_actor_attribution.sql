-- Attribute teacher-access mutations to the verified actor from the server-side web session.
-- This migration intentionally refuses unknown or partially transformed RPC definitions.
DO $migration$
DECLARE
  v_def text;
  v_legacy_count integer;
  v_bound_count integer;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'rpc_manage_teacher_access'
     AND p.proargtypes = '25 25 25 25 20 25 25 16 25'::oidvector
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'rpc_manage_teacher_access signature not found';
  END IF;

  SELECT count(*) INTO v_legacy_count
    FROM regexp_matches(
      v_def,
      $$values\s*\(\s*'web'\s*,\s*'teacher_access'\s*,\s*'teacher\.(class_add|class_remove|subject_add|subject_remove|permission_set|permission_remove)'$$,
      'gi'
    );

  SELECT count(*) INTO v_bound_count
    FROM regexp_matches(
      v_def,
      $$values\s*\(\s*'web'\s*,\s*v_admin\.teacher_id\s*,\s*'teacher\.(class_add|class_remove|subject_add|subject_remove|permission_set|permission_remove)'$$,
      'gi'
    );

  IF v_legacy_count = 6 AND v_bound_count = 0 THEN
    v_def := regexp_replace(
      v_def,
      $$values\s*\(\s*'web'\s*,\s*'teacher_access'\s*,\s*$$,
      $$values('web',v_admin.teacher_id,$$,
      'gi'
    );
    EXECUTE v_def;
  ELSIF v_legacy_count = 0 AND v_bound_count = 6 THEN
    -- Fully applied already: keep the function definition unchanged.
    NULL;
  ELSE
    RAISE EXCEPTION
      'Unexpected teacher-access audit actor state (legacy writes %, session-bound writes %); refusing rewrite',
      v_legacy_count, v_bound_count;
  END IF;
END
$migration$;
