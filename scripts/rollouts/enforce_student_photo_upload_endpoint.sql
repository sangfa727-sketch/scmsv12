-- MANUAL ROLLOUT ONLY: do not place this script in supabase/migrations.
-- Run only after the reviewed upload-school-asset Edge Function is deployed
-- and end-to-end student photo upload has passed.
-- This removes direct browser upload and object-listing policies only. The bucket
-- remains public for compatibility; known object URLs remain publicly accessible.
BEGIN;

DO $student_photo_rollout_preflight$
BEGIN
  IF to_regprocedure('public.rpc_authorize_student_photo_upload(text,text)') IS NULL THEN
    RAISE EXCEPTION 'student-photo authorization RPC is missing; stop rollout';
  END IF;
  IF NOT has_function_privilege('service_role',
      'public.rpc_authorize_student_photo_upload(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute student-photo authorization RPC; stop rollout';
  END IF;
  IF has_function_privilege('anon',
      'public.rpc_authorize_student_photo_upload(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
      'public.rpc_authorize_student_photo_upload(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'student-photo authorization RPC is exposed to browser roles; stop rollout';
  END IF;
END
$student_photo_rollout_preflight$;

DROP POLICY IF EXISTS "anon upload student photos" ON storage.objects;
-- Keep public read temporarily for compatibility with existing photo_url consumers.
-- A separate signed-URL migration must update all UI consumers before this policy is removed.

COMMIT;
