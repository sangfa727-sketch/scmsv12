-- Apply only after deploying the reviewed upload-school-asset Edge Function
-- and verifying student photo upload end-to-end against the new authorization RPC.
-- Keep public bucket visibility unchanged for compatibility; this removes browser
-- writes and object enumeration policy only. Known public object URLs remain public.
BEGIN;

DROP POLICY IF EXISTS "anon upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "public read student photos" ON storage.objects;

COMMIT;
