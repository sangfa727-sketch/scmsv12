# SCMS Production Security Drift Repair — Rollout Gate

## Scope

The forward-only migration `20261016120000_production_security_drift_repair.sql` repairs only the confirmed live mismatches:

1. Revoke direct browser-role privileges on `public.app_sessions`, `public.audit_log`, and `public.n8n_state`.
2. Replace the Parent Login RPC's full-row student response with an explicit UI allowlist and restrict direct RPC execution to `service_role`.
3. Create the private hashed-key Parent Login rate-limit store and bounded atomic rate-limit RPC.
4. Add the trusted student-photo authorization RPC and remove the direct anonymous upload / object-listing policies.

The migration does not modify business rows, student status, student records, stored photo URLs, or bucket visibility. It is idempotent for the intended schema state and is covered by a disposable PostgreSQL runtime harness.

## Critical migration-history warning

Production's migration history and repository filenames are drifted. **Do not run `supabase db push` or apply the historical backlog wholesale.** That can replay old migrations whose effects partly exist under different live migration versions.

Before rollout, reconcile the outstanding migration history against actual live schema, function definitions, grants, policies, and constraints. Apply only the reviewed forward-only repair migration; then record its exact version using the supported migration-repair workflow once its version is known. Do not hand-edit `supabase_migrations.schema_migrations`.

## Required rollout order

1. Confirm a current recoverable database backup / restore point is available.
2. Verify the PR's PostgreSQL runtime harness and CI are green.
3. Review the live preflight query results for the exact expected objects and function signatures.
4. Apply the reviewed repair migration as a single transaction, without applying the older missing migration backlog.
5. Immediately verify:
   - `anon` and `authenticated` have none of the seven direct table privileges on the three internal tables.
   - Parent Login RPC is executable by `service_role` only and no longer returns `qr_token`, `parent_email`, `school_id`, or internal student columns.
   - Rate-limit RPC works for allowed and over-limit attempts; its table is not directly accessible to browser roles.
   - Photo authorization allows an active same-school authorized session and rejects cross-school / invalid sessions.
   - Legacy direct upload and listing policies are absent.
6. Only after the migration verifies, deploy the version-controlled `parent-google-login` and `upload-school-asset` Edge Functions. Do not deploy the Parent Login function before its rate-limit RPC exists; it intentionally fails closed with HTTP 503 if the limiter is unavailable.
7. Run smoke checks for Parent Login, student photo upload, school logo/cover upload, and existing student CRUD. If any check fails, stop and fix forward; do not restore the old vulnerable function as a routine rollback.

## Compatibility and residual risks

- Parent Login keeps the current UI fields (`student_id`, names, class, photo URL, school name) and session-token contract; it no longer returns the full database row.
- Upload continues to use the current public photo URL format for compatibility. The migration does **not** make `student-photos` private. Direct access to known public object URLs remains a privacy risk while the bucket is public.
- Switching the photo bucket to private requires a separate migration of every photo URL consumer to signed/authenticated delivery and a compatibility test before changing `storage.buckets.public`.
- Revoking direct table grants should not break the trusted Edge Function because it uses the service-role key; the runtime harness checks that browser roles lose direct access while service-role RPC access remains.
- No Production migration or Edge Function is deployed by this PR. Production rollout is a separate, deliberate step after CI and review.
