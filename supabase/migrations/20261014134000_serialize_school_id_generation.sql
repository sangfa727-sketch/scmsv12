-- Serialize school ID generation with insertion inside the caller's transaction.
-- This prevents concurrent self-service registrations from selecting the same MAX()+1 ID.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_generate_school_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  next_num int;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('scms.rpc_generate_school_id')::bigint
  );

  SELECT COALESCE(MAX(CAST(SUBSTRING(school_id FROM 'SCH-(\\d+)') AS int)), 0) + 1
    INTO next_num
    FROM public.schools
   WHERE school_id ~ '^SCH-\\d+$';

  RETURN 'SCH-' || LPAD(next_num::text, 5, '0');
END;
$function$;

COMMIT;
