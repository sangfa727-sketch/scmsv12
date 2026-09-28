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
