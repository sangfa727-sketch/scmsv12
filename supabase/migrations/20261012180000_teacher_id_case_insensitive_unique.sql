-- Enforce case-insensitive Teacher ID uniqueness at the database boundary.
-- The RPC duplicate checks are helpful for friendly errors but are not concurrency-safe.
-- Keep the existing non-unique lookup index until the unique index is successfully built.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT lower(trim(teacher_id))
      FROM public.teachers
     GROUP BY lower(trim(teacher_id))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce case-insensitive Teacher ID uniqueness: duplicate normalized IDs exist';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS teachers_teacher_id_lower_uq
  ON public.teachers (lower(trim(teacher_id)));

DROP INDEX IF EXISTS public.idx_teachers_id_lower;
