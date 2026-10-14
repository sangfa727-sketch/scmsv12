# SCMS v12 Production security audit — findings and rollout gates

Audit mode: read-only against Supabase Production project `rszgbryucqwmrdbsgwbb`; code changes are isolated to draft PR #317. No Production DDL, data, configuration, or Edge Function deployment was performed. No Development Branch/staging environment was created.

## Changes prepared in draft PR #317

1. Upload status handling: compare teacher status case-insensitively so the deployed `active` value is accepted while inactive teachers remain blocked.
2. Upload content checks: enforce the 5 MiB cap before reading file bytes; validate JPEG, PNG, and WebP signatures in addition to client MIME type.
3. Parent login response: allowlist student fields and do not return the full student row or QR token.
4. Parent dashboard response: allowlist student and invoice fields used by `parent.html`.
5. Parent login RPC: remove direct EXECUTE from `anon` and `authenticated`; grant EXECUTE to `service_role`, used by the deployed `parent-google-login` Edge Function after Google token verification.
6. Internal tables: revoke direct browser-role privileges on `public.app_sessions`, `public.audit_log`, and `public.n8n_state`.
7. Regression tests and isolated PostgreSQL runtime test harness are added for the SQL changes.

## Verified findings that still need owner/admin review or a separately approved rollout

### P1 — Billing session identity binding fix is not deployed

The Production helpers `public._billing_session(text)` and `public._billing_admin_session(text)` validate token existence/expiry and teacher status/role, but do not bind the teacher's current school and role to the stored session's school and role. The code fix is present in the repository on main via migration `20261014120000_harden_billing_session_identity_binding.sql`, but Production migration history did not include it during this audit. Keep it as a deployment blocker until the change is reviewed, approved, and applied through the normal migration process.

### P1 — Teacher web-session identity binding migration is also absent in Production

Read-only inspection found no `teachers_revoke_web_sessions_on_identity_change` trigger on Production's `public.teachers` table, and the Production migration-history query returned no `20261013...` entries. The repository already contains `supabase/migrations/20261013100000_revoke_stale_web_sessions_on_identity_change.sql`, which expires existing sessions with mismatched school/role/status and installs triggers to revoke sessions when those identity attributes change. Because many SECURITY DEFINER RPCs rely on a valid session token and not all independently re-bind every identity field, deploying this existing migration is a high-priority rollout gate. It was not executed as part of this audit.

### P1/P2 — Broad default privileges for owner role `supabase_admin`

Read-only inspection found broad default grants to `anon` and `authenticated` for future public-schema tables, functions, and sequences created by `supabase_admin`. The repository's existing default-privilege migration only addresses role `postgres`. Production `postgres` is not a member of `supabase_admin`; do not force this change through by granting role membership. Review with the authorized Supabase owner/admin, identify expected API grants, then remediate defaults under the correct owner role.

### P2 — Diagnostic catalog views readable by browser roles

`public.tap_funky` and `public.pg_all_foreign_keys` are readable by browser roles and expose catalog/function or foreign-key metadata. They are owned by `supabase_admin`, so a normal migration executed as `postgres` may not be able to revoke grants. An owner/admin runbook is provided separately; verify consumers before changing grants.

### P2 — Teacher invite redemption race (fixed in this draft; runtime validation pending)

The Production `rpc_google_login` invite path selected an unredeemed invite without a row lock before creating the teacher and marking the invite redeemed. Concurrent requests could both observe the invite as unused and create multiple teacher records. Draft migration `20261014133000_lock_teacher_invite_redemption.sql` uses `FOR UPDATE` on the matching invite row and includes a one-time-redemption regression test. It has not been applied to Production.

### P2 — Concurrent self-service school ID allocation (fixed in this draft; runtime validation pending)

Production `public.rpc_generate_school_id()` computes the next ID using `MAX(...)+1`. Concurrent self-service school registrations could choose the same ID before either transaction inserts the new school. Draft migration `20261014134000_serialize_school_id_generation.sql` uses a transaction-scoped advisory lock around allocation; the existing registration transaction inserts the row before releasing the lock. The migration has not been applied to Production.

### P2 — Public login endpoint rate limiting

The deployed `parent-google-login` Edge Function has `verify_jwt=false` and performs Google ID-token verification via Google's `tokeninfo` endpoint, checking audience, issuer, verified email, and expiry before calling the parent login RPC with the service-role key. This manual verification is the intended authentication path, but the reviewed code has no application-level rate limiting. Add abuse/rate-limit controls and operational monitoring before treating endpoint-abuse risk as closed.

### P2 — Migration history drift

Earlier read-only comparison found repository migration filenames/counts diverge from Production migration history. Reconcile renamed/missing migrations with a documented mapping before relying on automated migration history as proof that all code changes are deployed. Do not replay historical migrations or repair migration history directly in Production during this audit.

### Review backlog — SECURITY DEFINER and RLS

The database contains many SECURITY DEFINER functions callable by browser roles, and public tables with RLS enabled but no policies. Neither pattern alone proves exploitability: review each function's identity checks, tenant scoping, search path, return payload, and side effects. RLS-enabled tables without policies normally fail closed for browser roles, but verify intended service-side access before changing policies.

## Rollout gates

- Latest branch CI must pass, including the isolated parent-portal PostgreSQL runtime harness.
- Review SQL function definitions and compare intended JSON response fields with the parent portal UI.
- Resolve owner-role privilege findings with the authorized project owner/admin.
- Review and approve the billing session identity binding migration.
- Merge and deployment require explicit approval; until then this PR remains a draft and Production stays unchanged.
