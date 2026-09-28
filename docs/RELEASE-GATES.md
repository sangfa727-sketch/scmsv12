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

- Audited public `SECURITY DEFINER` functions that accept tenant/actor identifiers. The legacy direct-identity attendance overloads, school approval/config helpers, and `rpc_chat_send` are not granted to `anon`/ `authenticated`; `rpc_chat_send` was explicitly revoked from those roles during this hardening pass.
- The active web feature mutation/read RPC surface uses `p_session_token` and is granted to `anon`/ `authenticated` as the browser contract. These functions must derive tenant and actor context from `app_web_sessions`, then enforce role/resource authorization inside the function.
- `rpc_web_bootstrap` and `rpc_web_session_verify` require an unexpired session and an active teacher; both refresh the rolling 30-day session expiry. Logout deletes the exact session token.
- Public authentication entry points such as teacher/password login, Google login, email signup/login, QR resolution, and parent login are intentionally callable before a session exists; they must create or validate identity and then return a server-issued session/token rather than accepting an arbitrary school identity as authorization.
- Do not revoke or alter public auth functions solely because they are SECURITY DEFINER. Review their authentication purpose separately from tenant-bound feature RPCs.

## Billing and view hardening recorded

- `v_students_full` and `v_today_attendance` are now `security_invoker=true`, so the views no longer bypass the underlying table RLS policies.
- Billing invoice creation now verifies that the target student belongs to the authenticated session school, an optional term belongs to that school, and every supplied `fee_item_id` belongs to that school before inserting invoice data.
- Billing session/maintenance and mutation functions `_billing_session`, `_recalc_invoice`, `rpc_delete_invoice`, `rpc_record_payment`, and `rpc_delete_payment` now pin `search_path` to `public, pg_temp` to reduce SECURITY DEFINER search-path risk.
- A negative-path database check with an invalid session returned `invalid_session`; no billing row was created.
- The remaining Security Advisor search-path warnings are broader legacy/schema-wide findings and are not being mass-modified without function-by-function review.
