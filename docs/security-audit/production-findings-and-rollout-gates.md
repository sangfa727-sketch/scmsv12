# SCMS v12 Production security audit — findings and rollout gates

Audit mode: read-only against Supabase Production project `rszgbryucqwmrdbsgwbb`; code changes are isolated to draft PR #317. No Production DDL, data, configuration, or Edge Function deployment was performed. No Development Branch/staging environment was created.

## Changes prepared in draft PR #317

1. Upload status handling: compare teacher status case-insensitively so the deployed `active` value is accepted while inactive teachers remain blocked.
2. Upload content checks: enforce the 5 MiB cap before reading file bytes; validate JPEG, PNG, and WebP signatures in addition to client MIME type.
3. Parent login response: allowlist student fields and do not return the full student row or QR token.
4. Parent login/dashboard response: allowlist student and invoice fields used by `parent.html`, including the UI-required `school_name`, without exposing QR tokens, parent phone numbers, notes, or arbitrary student metadata.
5. Parent login RPC: remove direct EXECUTE from `anon` and `authenticated`; grant EXECUTE to `service_role`, used by the deployed `parent-google-login` Edge Function after Google token verification.
6. Internal tables: draft migration revokes direct browser-role privileges on `public.app_sessions`, `public.audit_log`, and `public.n8n_state`. A fresh read-only Production check reconfirmed `anon` and `authenticated` still have direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges; the draft migration has not been applied.
7. Serialize invite redemption and school ID allocation; add regression tests for one-time invite use and distinct school IDs.
8. Regression tests and an isolated PostgreSQL runtime harness cover the SQL changes; the parent-portal SQL harness passed on the latest code head.
9. Native student mutation audit payloads now record the student ID and submitted field names, not the submitted student name, class, grade, or parent contact values; an isolated PostgreSQL regression assertion covers this minimization.

## Verified findings that still need owner/admin review or a separately approved rollout

### P1 — Billing session identity binding fix is not deployed

The Production helpers `public._billing_session(text)` and `public._billing_admin_session(text)` validate token existence/expiry and teacher status/role, but do not bind the teacher's current school and role to the stored session's school and role. The code fix is present in the repository on main via migration `20261014120000_harden_billing_session_identity_binding.sql`, but Production migration history did not include it during this audit. Keep it as a deployment blocker until the change is reviewed, approved, and applied through the normal migration process.

### P1 — Teacher web-session identity binding migration is also absent in Production

Read-only inspection found no `teachers_revoke_web_sessions_on_identity_change` trigger on Production's `public.teachers` table, and the Production migration-history query returned no `20261013...` entries. The repository already contains `supabase/migrations/20261013100000_revoke_stale_web_sessions_on_identity_change.sql`, which expires existing sessions with mismatched school/role/status and installs triggers to revoke sessions when those identity attributes change. Because many SECURITY DEFINER RPCs rely on a valid session token and not all independently re-bind every identity field, deploying this existing migration is a high-priority rollout gate. It was not executed as part of this audit.

### P1/P2 — Broad default privileges for owner role `supabase_admin`

Read-only inspection found broad default grants to `anon` and `authenticated` for future public-schema tables, functions, and sequences created by `supabase_admin`. The repository's existing default-privilege migration only addresses role `postgres`. Production `postgres` is not a member of `supabase_admin`; do not force this change through by granting role membership. Review with the authorized Supabase owner/admin, identify expected API grants, then remediate defaults under the correct owner role.

### P2 — Diagnostic catalog views readable by browser roles

A fresh read-only privilege query reconfirmed `SELECT` on `public.tap_funky` and `public.pg_all_foreign_keys` for both `anon` and `authenticated`. These views expose catalog/function or foreign-key metadata. They are owned by `supabase_admin`, so a normal migration executed as `postgres` may not be able to revoke grants. An owner/admin runbook is provided separately; verify consumers before changing grants.

### P2 — Teacher invite redemption race (fixed in draft; isolated runtime test passed)

The Production `rpc_google_login` invite path selected an unredeemed invite without a row lock before creating the teacher and marking the invite redeemed. Concurrent requests could both observe the invite as unused and create multiple teacher records. Draft migration `20261014133000_lock_teacher_invite_redemption.sql` uses `FOR UPDATE` on the matching invite row and includes a one-time-redemption regression test. It has not been applied to Production.

### P2 — Concurrent self-service school ID allocation (fixed in draft; isolated runtime test passed)

Production `public.rpc_generate_school_id()` computes the next ID using `MAX(...)+1`. Concurrent self-service school registrations could choose the same ID before either transaction inserts the new school. Draft migration `20261014134000_serialize_school_id_generation.sql` uses a transaction-scoped advisory lock around allocation; the existing registration transaction inserts the row before releasing the lock. The migration has not been applied to Production.

### P2 — Public login endpoint rate limiting

The deployed `parent-google-login` Edge Function has `verify_jwt=false` and performs Google ID-token verification via Google's `tokeninfo` endpoint, checking audience, issuer, verified email, and expiry before calling the parent login RPC with the service-role key. This manual verification is the intended authentication path, but the reviewed code has no application-level rate limiting. Add abuse/rate-limit controls and operational monitoring before treating endpoint-abuse risk as closed.

### P2 — Migration history drift

A fresh read-only comparison counted 149 SQL migration files on repository `main` versus 202 Production `schema_migrations` rows. Exact filename-stem/name matching found 62 overlaps and only 2 exact version-ID overlaps; 141 Production history names do not match a current repository filename stem. This is a reconciliation signal, not proof that the corresponding schema objects are missing, because historical files may have been renamed, remapped, squashed, or applied under different migration identifiers. Build a reviewed mapping from each historical migration to its current equivalent and verify live schema/function/grant state before any rollout. Do not replay historical migrations or repair migration history directly in Production during this audit.

### P1/P2 — Student photo objects remain publicly readable

Production uses a public `student-photos` bucket, so knowing or obtaining an object URL is sufficient to read the image; Storage object-read RLS does not make an object private in a public bucket. Draft migration `20261014136000_secure_student_photo_upload.sql` removes anonymous direct-upload and object-listing policies, but intentionally preserves public object URL compatibility. This does not close photo confidentiality risk. Before changing the bucket to private, redesign all student-photo consumers to use short-lived signed URLs and test cache, portal, native app, and legacy stored-URL behavior. No bucket configuration was changed during this audit.

Code review of the proposed migration also found a fail-open edge case: `IF NOT private.web_has_student_permission(...)` does not reject a SQL NULL result. The draft branch migration has now been corrected to use `IS NOT TRUE`, with a regression assertion added. This is a branch-only correction, not a deployed Production change.

### P2 — Parent contact details duplicated into audit-log payloads (fix prepared; historical rows unchanged)

Production `rpc_update_student_parent(text,text,text,text,text,text)` was found to write parent name, primary/secondary phone, and email into `public.audit_log.payload`. Draft migration `20261014141000_minimize_parent_contact_audit_payload.sql` replaces this behavior with student ID and changed-field names only; see the following subsection. Historical audit rows still contain their existing payloads. Do not rewrite or delete historical audit data without an approved retention plan. The new function is not deployed to Production.

### P2 — Parent contact values in audit payloads (fix prepared in PR #317)

The read-only Production function review confirmed that `rpc_update_student_parent` previously copied parent names, phone numbers, and email addresses into `audit_log.payload`. Draft migration `20261014141000_minimize_parent_contact_audit_payload.sql` now records the student ID and changed field names only, while preserving the existing RPC response fields for UI compatibility. An isolated PostgreSQL regression test verifies the audit payload contains no submitted contact values and that an invalid session is rejected. This is not a Production fix until the migration is reviewed, approved, and applied through the normal rollout process.

### Review backlog — SECURITY DEFINER and RLS

Read-only catalog queries found 180 SECURITY DEFINER functions executable by `anon` and 182 executable by `authenticated`; 164 browser-callable SECURITY DEFINER functions reference `app_web_sessions`. A simple source-text heuristic flagged 132 of those as lacking literal `school_id = s.school_id` and `role = s.role` patterns. This is a triage signal only—not a confirmed vulnerability count—because functions use different aliases, helper functions, and authorization models. Audit these in prioritized batches and add runtime tenant-isolation tests before changing grants or logic. Public tables with RLS enabled but no policies normally fail closed for browser roles; verify intended service-side access before changing policies.

## Rollout gates

- Latest branch CI must pass, including the isolated parent-portal PostgreSQL runtime harness.
- Review SQL function definitions and compare intended JSON response fields with the parent portal UI.
- Resolve owner-role privilege findings with the authorized project owner/admin.
- Review and approve the billing session identity binding migration.
- Merge and deployment require explicit approval; until then this PR remains a draft and Production stays unchanged.


## Latest read-only recheck (2026-10-14)

- Production `storage.buckets` still reports `student-photos.public = true`; `storage.objects` still has an `anon upload student photos` INSERT policy for `{anon, authenticated}` and a `public read student photos` SELECT policy. This is a confirmed confidentiality blocker, not merely a Security Advisor warning.
- Production direct grants on `app_sessions`, `audit_log`, and `n8n_state` remain broad for `anon` and `authenticated`; the PR migration only changes the branch until formally deployed.
- CI run `38591458038` for commit `cfe8fea78c53e5a5022dba7d9653d76f86fedfd8` completed successfully with all 11 automatic jobs passing, including the Playwright smoke test and isolated parent-contact audit runtime test. Subsequent commits fixed the student-photo permission helper's NULL fail-open edge case and added a regression assertion; CI for those newer commits must pass before merge.
- All checks above were read-only. No Production configuration, storage policy, table grant, schema, data, or deployed function was changed.
