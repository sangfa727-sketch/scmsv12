# Production owner-role privilege remediation (manual review only)

This runbook documents two verified Production privilege findings. It is **not** an automatic migration and has not been executed. Do not paste it into Production until the project owner confirms intended access and an approved maintenance/change window exists.

## Why a normal migration cannot safely apply this

Read-only inspection showed the diagnostic views `public.tap_funky` and `public.pg_all_foreign_keys` are owned by `supabase_admin`, while the migration role `postgres` is not a member of `supabase_admin`. A migration that attempts to revoke privileges on those views or alter `supabase_admin` default privileges may fail. Do not work around this by granting role membership to `postgres` without explicit security review.

## A. Restrict diagnostic catalog views

Run as the actual object owner (or an authorized superuser) after confirming these views are not intentionally consumed by browser clients:

```sql
REVOKE SELECT ON TABLE public.tap_funky, public.pg_all_foreign_keys
FROM anon, authenticated;
```

The views expose function/catalog metadata and foreign-key relationship metadata. They are not needed for normal browser workflows based on the repository review, but verify consumers before applying.

## B. Correct future-object default grants

The current `pg_default_acl` entries for `supabase_admin` grant broad table, function, and sequence privileges to `anon` and `authenticated`. The following affects **future objects created by supabase_admin only**; it does not change existing objects:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
```

Before applying, confirm Supabase-managed object creation and expected client grants. If the executing role cannot act as `supabase_admin`, stop and use the project's authorized owner/admin process; do not grant extra role membership just to make this run.

## C. Read-only verification after an approved change

```sql
SELECT c.relname,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('tap_funky', 'pg_all_foreign_keys');

SELECT d.defaclrole::regrole AS owner_role,
       d.defaclobjtype,
       d.defaclacl
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
  AND d.defaclrole = 'supabase_admin'::regrole;
```

Review any remaining grants by purpose rather than blanket-revoking privileges from all public-schema functions or tables.
