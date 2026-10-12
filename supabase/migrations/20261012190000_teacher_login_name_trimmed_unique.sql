-- Enforce case-insensitive login-name uniqueness after trimming whitespace.
-- The preflight aborts safely rather than deleting or rewriting existing accounts.
DO $preflight$
DECLARE
  v_duplicate_groups integer;
BEGIN
  SELECT count(*) INTO v_duplicate_groups
  FROM (
    SELECT lower(trim(login_name))
      FROM public.teachers
     WHERE login_name IS NOT NULL
     GROUP BY lower(trim(login_name))
    HAVING count(*) > 1
  ) duplicates;

  IF v_duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce normalized teacher login-name uniqueness: % duplicate groups require review',
      v_duplicate_groups;
  END IF;
END
$preflight$;

-- Add the stronger index before removing the legacy index so uniqueness is
-- continuously enforced during the migration transaction.
CREATE UNIQUE INDEX teachers_login_name_trimmed_ci_uq
  ON public.teachers (lower(trim(login_name)));

DROP INDEX IF EXISTS public.teachers_login_name_lower_uq;
