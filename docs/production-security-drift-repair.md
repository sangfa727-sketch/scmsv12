# SCMS Production Security Drift Repair — Rollout Gate

## Scope

The forward-only repair set (`20261016120000_production_security_drift_repair.sql` plus `20261016140000_revoke_public_internal_table_grants.sql`) addresses the confirmed live mismatches:

1. Revoke direct browser-role privileges on `public.app_sessions`, `public.audit_log`, and `public.n8n_state`, including privileges inherited from `PUBLIC`.
2. Replace the Parent Login RPC's full-row student response with an explicit UI allowlist and restrict direct RPC execution to `service_role`.
3. Create the private hashed-key Parent Login rate-limit store and bounded atomic rate-limit RPC.
4. Minimize all six legacy manual student CRUD response payloads, remove parent-contact values from student-update audit events, and harden legacy web student deletion to current-school admin-only soft delete.
5. Minimize parent-contact audit payloads to changed field names.
6. Add the trusted student-photo authorization RPC. Direct upload / object-listing policy removal is a separate manual rollout script outside the automatic migration directory.

The migration does not modify business rows, student status, student records, stored photo URLs, or bucket visibility. It is idempotent for the intended schema state and is covered by a disposable PostgreSQL runtime harness.

## Critical migration-history warning

Production's migration history and repository filenames are drifted. **Do not run `supabase db push` or apply the historical backlog wholesale.** That can replay old migrations whose effects partly exist under different live migration versions.

Before rollout, reconcile the outstanding migration history against actual live schema, function definitions, grants, policies, and constraints. Apply only the reviewed forward-only repair migration; then record its exact version using the supported migration-repair workflow once its version is known. Do not hand-edit `supabase_migrations.schema_migrations`.

## Student-photo migration ownership

The historical migration `20261014136000_secure_student_photo_upload.sql` creates the authorization RPC only; it deliberately does not drop either legacy Storage policy. Policy removal has one owner: `scripts/rollouts/enforce_student_photo_upload_endpoint.sql`. It is deliberately outside `supabase/migrations/` so a routine migration replay or `supabase db push` cannot remove the policies before the reviewed Edge Function is deployed and smoke-tested. The disposable runtime harness replays the historical migration, checks that both policies remain, applies the forward repair and checks again, then applies the manual rollout script and verifies policy removal. This prevents fresh-install migration replay from silently bypassing the staged rollout.

## Required rollout order

1. Confirm a current recoverable database backup / restore point is available.
2. Verify the PR's PostgreSQL runtime harness and CI are green.
3. Review the live preflight query results for the exact expected objects and function signatures.
4. Deploy the updated frontend (`parent.html`) before or together with the migration. It falls back to the old payload shape, so deploying the frontend first is compatible with the current backend and avoids a window where the old frontend counts only the capped 30-row list after the new RPC is applied.
5. Apply `20261016120000_production_security_drift_repair.sql` as a single transaction, without applying the older missing migration backlog. This creates the photo authorization RPC but deliberately leaves the legacy photo policies in place.
6. Apply `20261016140000_revoke_public_internal_table_grants.sql` to remove any grants inherited through `PUBLIC` on the three internal tables. This does not remove explicit grants assigned directly to trusted roles.
7. Immediately verify:
   - `anon` and `authenticated` have none of the seven direct table privileges on the three internal tables.
   - Parent Login RPC is executable by `service_role` only and no longer returns `qr_token`, `parent_email`, `school_id`, or internal student columns.
   - Rate-limit RPC works for allowed and over-limit attempts; its table is not directly accessible to browser roles.
   - All six manual student CRUD RPCs return only allowlisted student/admission fields.
   - Student-update and parent-contact audit records omit phone/email values and retain only field names.
   - Legacy student deletion rejects cross-school and NULL-permission cases while preserving same-school admin soft delete.
   - Photo authorization allows an active same-school authorized session and rejects cross-school / invalid sessions.
   - After step 5, verify the legacy direct-upload and listing policies are still present (they must remain during the Edge Function deployment gap). Confirm they are absent only after step 10 applies the manual policy-removal rollout script.
8. **Student-photo staged rollout:** Repository code already wires `API.uploadStudentPhoto()` to `upload-school-asset` with `kind=student`; the Edge Function validates the school session and calls `rpc_authorize_student_photo_upload` before writing to `student-photos`. Production currently runs an older deployed version, so first deploy the reviewed version-controlled `upload-school-asset` only after step 4 has created the RPC. Until the new function is deployed, the old direct-upload policy remains in place, avoiding an upload outage.
9. Smoke-test student photo upload and verify the returned URL and stored object path. Also smoke-test school logo/cover and teacher asset uploads. If any test fails, stop and fix forward; do not remove the legacy photo policy.
10. Only after successful upload verification, run `scripts/rollouts/enforce_student_photo_upload_endpoint.sql` manually to remove the direct browser upload and object-listing policies. Then re-run student photo upload and verify it still succeeds through the Edge Function. The bucket remains public for existing URL compatibility; this is not a private-photo migration.
11. Deploy the version-controlled `parent-google-login` only after the rate-limit RPC exists. Run smoke checks for Parent Login and existing manual student CRUD. If any check fails, stop and fix forward; do not restore the old vulnerable function as a routine rollback.

## Compatibility and residual risks

- Parent Login keeps the current UI fields (`student_id`, names, class, photo URL, school name) and session-token contract; it no longer returns the full database row.
- Parent Dashboard returns the latest 30 attendance rows for history display and a separate `attendance_summary` computed across the student's complete school-scoped attendance history, so Present/Absent/Late totals remain accurate. The frontend falls back to counting returned rows while an older backend is still deployed. Exams, parent messages, timetable, events, and leave requests are bounded. Grade history and invoice history (including invoice items and payments) remain complete and therefore unbounded to avoid silently hiding historical records. This is a residual payload/performance risk for unusually large accounts; add UI pagination before introducing safe caps.
- Upload continues to use the current public photo URL format for compatibility. The migration does **not** make `student-photos` private. Direct access to known public object URLs remains a privacy risk while the bucket is public.
- Switching the photo bucket to private requires a separate migration of every photo URL consumer to signed/authenticated delivery and a compatibility test before changing `storage.buckets.public`.
- Revoking direct table grants should not break the trusted Edge Function because it uses the service-role key; the runtime harness checks that browser roles lose direct access while service-role RPC access remains.
- No Production migration or Edge Function is deployed by this PR. Production rollout is a separate, deliberate step after CI and review.
