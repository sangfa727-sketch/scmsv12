# SCMS Release Gates

## Safe feature lifecycle

### Gate 0 — Scope
- Identify the feature/module being changed.
- Identify database tables, RPCs, Edge Functions, n8n workflows, and pages touched.
- Explicitly list what must not change.

### Gate 1 — Isolated development
- Work on a feature branch.
- Use synthetic/test accounts.
- Never point experimental code at production write endpoints.

### Gate 2 — Automated checks

Run:

    npm test

Required checks include syntax, static regressions, page coverage, feature
workflow contracts, security contracts, authorization/session contracts, and
state-management architecture contracts.

### Gate 3 — Isolated backend

Before database/RPC changes:
- use a Supabase preview branch or separate staging project;
- use staging-only test accounts;
- verify RLS/tenant boundaries;
- verify admin vs teacher permissions;
- verify session expiry/revocation behavior.

### Current free-tier environment status

The repository now protects local development from production writes by
disabling the backend on localhost. A real authenticated staging environment
has not been provisioned because the current project is intentionally avoiding
the recurring cost of a hosted Supabase branch/project.

Therefore:
- local UI/feature work may use demo data safely;
- production must not be used as a test database;
- Gate 4 cannot be claimed complete until an isolated staging backend and
  staging-only credentials exist;
- the GitHub E2E job is guarded so it runs only when staging secrets are present.

### Gate 4 — Authenticated E2E

Run Playwright against staging:

    SCMS_URL=<staging-url> npm run test:e2e

Do not use customer credentials.

### Gate 5 — Release review

Confirm:
- no production data was used as a test fixture;
- no service-role secret entered frontend code;
- feature flags default safely;
- migrations are reviewed;
- rollback path is known.

### Gate 6 — Production rollout

Only after all previous gates pass:
1. merge to main;
2. deploy;
3. verify health/smoke checks;
4. monitor errors;
5. enable the feature for customers according to the rollout plan.

## Test account policy

Test accounts are isolated identities, not special client accounts inside the
production tenant. If a feature needs privileged access, create the test admin
in staging and exercise the same authorization path used by production.

## Important distinction

- UI gating hides a feature.
- Feature flags control rollout.
- RLS/RPC authorization protects data.
- Environment isolation protects production from test writes.

All four are needed for a production SaaS system.

## Security finding recorded — legacy chat RPC

The legacy `rpc_chat_send(p_school_id, p_channel, p_teacher_id, p_teacher_name, p_text)` SECURITY DEFINER RPC accepted tenant and actor identity from the caller. It was not used by the current frontend feature API surface, while the session-bound `rpc_send_chat_message(p_session_token, ...)` exists for authenticated web access. Execute permission for the legacy RPC was therefore removed from `anon` and `authenticated`; backend/service-role callers remain unaffected. If a legacy integration needs it later, migrate that caller to the session-bound contract instead of restoring public execute permission.

## Latest backend authorization audit

- Audited public `SECURITY DEFINER` functions that accept tenant/actor identifiers. The legacy direct-identity attendance overloads, school approval/config helpers, and `rpc_chat_send` are not granted to `anon`/`authenticated`; `rpc_chat_send` was explicitly revoked from those roles during this hardening pass.
- The active web feature mutation/read RPC surface uses `p_session_token` and is granted to `anon`/`authenticated` as the browser contract. These functions must derive tenant and actor context from `app_web_sessions`, then enforce role/resource authorization inside the function.
- `rpc_web_bootstrap` and `rpc_web_session_verify` require an unexpired session and an active teacher; both refresh the rolling 30-day session expiry. Logout deletes the exact session token.
- Public authentication entry points such as teacher/password login, Google login, email signup/login, QR resolution, and parent login are intentionally callable before a session exists; they must create or validate identity and then return a server-issued session/token rather than accepting an arbitrary school identity as authorization.
- Do not revoke or alter public auth functions solely because they are SECURITY DEFINER. Review their authentication purpose separately from tenant-bound feature RPCs.

## Billing and view hardening recorded

- `v_students_full` and `v_today_attendance` are now `security_invoker=true`, so the views no longer bypass the underlying table RLS policies.
- Billing invoice creation now verifies that the target student belongs to the authenticated session school, an optional term belongs to that school, and every supplied `fee_item_id` belongs to that school before inserting invoice data.
- Billing session/maintenance and mutation functions `_billing_session`, `_recalc_invoice`, `rpc_delete_invoice`, `rpc_record_payment`, and `rpc_delete_payment` now pin `search_path` to `public, pg_temp` to reduce SECURITY DEFINER search-path risk.
- A negative-path database check with an invalid session returned `invalid_session`; no billing row was created.
- The remaining Security Advisor search-path warnings are broader legacy/schema-wide findings and are not being mass-modified without function-by-function review.

## Critical RPC search-path hardening recorded

The next high-risk subset was reviewed by function definition instead of mass-changing the entire schema. Search paths are now pinned to `public, pg_temp` for the active web authentication/session boundary and selected feature RPCs:

- `rpc_teacher_web_login`
- `rpc_email_login`
- `rpc_google_login`
- `rpc_web_session_verify`
- `rpc_web_bootstrap`
- `rpc_web_logout`
- `rpc_admin_create_teacher`
- `rpc_admin_reset_teacher_password`
- `rpc_admin_list_teachers`
- `rpc_admin_list_invites`
- `rpc_admin_create_invite`
- `rpc_get_students`
- `rpc_save_homework`
- `rpc_save_grades`
- `rpc_create_assessment`

Post-change verification confirmed these signatures have the expected fixed search path. Security Advisor's mutable-search-path count decreased from 107 to 95. The remaining findings require individual dependency/authorization review and are intentionally not being changed blindly.

The session-bound attendance implementation was also re-verified: it derives school/teacher from the active session and validates every submitted student against the session school and requested class before replacing attendance rows. The legacy direct-identity overloads remain a separate compatibility surface and must not be exposed to browser roles.

## Student resource tenant hardening

Reviewed session-bound resource mutations that accept a student or route identifier. The following RPCs now validate the referenced student against the authenticated session school before writing, and transport assignment also validates the route against the same school:

- `rpc_save_daily_report`
- `rpc_save_incident`
- `rpc_add_vaccination`
- `rpc_add_health_visit`
- `rpc_checkout_book`
- `rpc_assign_student_transport`

These functions also pin their SECURITY DEFINER `search_path` to `public, pg_temp`. Invalid-session negative-path checks returned `invalid_session` for all six RPCs. Security Advisor mutable-search-path findings decreased from 95 to 89.

## Auth/session RPC search-path hardening

Reviewed the remaining auth/session-sensitive SECURITY DEFINER RPCs before changing them. The following were verified to derive identity from an active `app_web_sessions` record and now pin `search_path` to `public, pg_temp`:

- `rpc_change_password`
- `rpc_telegram_connect_start`
- `rpc_telegram_connect_finish`
- `rpc_telegram_disconnect`
- `rpc_email_signup`
- `rpc_get_my_data`

Negative-path verification with an invalid session token returned `invalid_session` for password change, Telegram connect start/finish/disconnect, and data retrieval.

## Tenant/resource RPC search-path hardening — latest batch

A further function-by-function review covered the legacy Telegram bootstrap helpers and session-bound student/resource operations. The following SECURITY DEFINER functions now pin `search_path` to `public, pg_temp`:

- `rpc_bootstrap` — legacy Telegram bootstrap; reviewed separately because it is not directly executable by `anon`/`authenticated` and is reached through the backend bootstrap path.
- `rpc_get_school_config`
- `rpc_get_current_term`
- `rpc_update_school_config`
- `rpc_delete_student`
- `rpc_delete_timetable`
- `rpc_get_fee_items`
- `rpc_update_homework`
- `rpc_delete_homework`
- `rpc_update_timetable`

The six browser-facing resource RPCs were checked with an invalid session token and all returned `invalid_session` without performing the requested operation. Post-change verification confirmed the expected fixed search path on all ten functions.

Security Advisor's mutable-search-path warning count decreased from 89 to 73. The remaining findings are intentionally being handled by dependency/authorization review rather than a blanket ALTER across the schema.
