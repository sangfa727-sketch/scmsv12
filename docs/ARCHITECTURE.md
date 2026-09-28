# SCMS v12 Architecture & Maintainability

## Goal

SCMS must grow into a production multi-school service without allowing one
feature change, test account, or experimental page to unexpectedly affect
another school or production users.

The frontend is intentionally not being rewritten into a framework. Boundaries
come first; migration can happen feature-by-feature.

## 1. State management

js/01_config.js remains the compatibility layer for the existing window.APP
object. js/01B_state.js is the new state boundary.

State sections:
- session — authentication/session lifecycle only.
- tenant — school + teacher + role identity.
- data — server-backed feature collections.
- ui — navigation and transient UI state.
- flags — controlled feature rollout switches.

### Rules for new code

1. Do not create new top-level mutable globals.
2. Do not let one feature module own another feature's state.
3. Do not mutate another feature's collection as a side effect.
4. Prefer APPStore.get(), APPStore.set(), and APPStore.patch().
5. Keep server writes inside API modules; UI modules call API functions.
6. A feature should be removable without requiring unrelated feature state.
7. Existing window.APP reads remain temporarily for compatibility.
8. New state must not expand the global window.APP surface.

### Migration order

auth/session -> tenant context -> navigation/UI -> students -> attendance ->
academics -> billing/admissions -> communication/resources -> remaining features.

No large rewrite is required.

## 2. Environment isolation

Production and test environments are different trust zones.

| Environment | Purpose | Production customer data |
|---|---|---|
| development | local developer work | never |
| preview/staging | feature + regression testing | never |
| production | released customer service | yes |

A Git branch is not a security boundary. Database/API isolation is required.

### Required model

- Production uses the production Supabase project/database.
- Staging/preview uses an isolated Supabase branch/project.
- Test accounts exist only in staging/preview.
- Test data is synthetic and clearly tagged.
- Experimental features are disabled by default in production.
- Production rollout happens only after staging verification.

Supabase documents separate development, staging/preview, and production
environments, and preview branches provide isolated database environments.

## 3. Frontend environment boundary (implemented)

The static frontend now has an explicit deployment-environment boundary in
`js/00_env.js` and `js/01_config.js`.

- Local development hosts (`localhost`, `127.0.0.1`, `::1`) run with the
  backend disabled and use the existing demo bootstrap path.
- Hostnames containing `staging`, `preview`, `test`, or `dev` are treated
  as non-production. They fail closed unless a dedicated
  `window.__SCMS_STAGING_CONFIG__` is injected.
- A staging configuration is rejected if it points to the known production
  Supabase or n8n endpoints.
- Unknown hosted environments remain production by default; environment
  selection is not controlled by URL query parameters.
- The environment selector is a deployment convenience, not an authorization
  boundary. Database/API isolation remains mandatory.
- No paid Supabase staging branch/project is provisioned yet. Until one exists,
  authenticated staging E2E is intentionally not considered available.
- GitHub E2E jobs require staging URL + test credentials before they can run;
  they will not silently fall back to localhost or production.

This gives the free/local workflow a fail-closed development boundary without
pretending that local demo mode is a substitute for an isolated staging
database.

## 3. Feature rollout

design -> implementation branch -> static tests -> isolated DB/API test ->
authenticated E2E -> staging verification -> release review -> production.

Production must never be the first place a database migration, RPC, destructive
workflow, or new feature is exercised.

Client-side feature flags are UI controls, not authorization controls. Sensitive
features must also be protected by backend authorization.

## 4. Frontend feature isolation (implemented)

Feature additions must be scoped to their owning page/module.

- New page-specific CSS must use a page root (for example `#page-...`) or a
  feature-specific class prefix. Avoid broad selectors such as `.card`,
  `.button`, `.list-card`, or bare `button` when the change belongs to one
  feature.
- Settings-specific styling is currently guarded by automated tests so its
  selectors remain Settings-scoped.
- Settings code must not directly mutate unrelated page containers, global
  styles, or shared feature collections. Shared application identity/state is
  exposed through the central store and existing application boundary.
- New feature UI should be rendered inside its page/modal root and should not
  rely on global DOM queries for unrelated components.
- Regression tests are part of the feature contract. A feature is not
  considered isolated merely because it looks correct on the developer's
  screen.

## 4. Tenant isolation

Every authenticated request must derive school/tenant identity from the
authenticated server-side session, not trust a client-provided school_id or
teacher_id.

For every tenant-sensitive feature, tests should prove:

- school A can read/write only school A data;
- school A cannot access school B data by changing an ID;
- a teacher cannot elevate their role by changing client state;
- admin-only RPCs reject non-admin sessions;
- expired/revoked sessions cannot mutate data.

## 5. Release safety

Before production merge:

- npm test passes.
- Security-contract tests pass.
- Feature workflow contracts pass.
- Auth/session contracts pass.
- E2E smoke passes against staging when credentials are configured.
- Database/RPC security review has no unresolved critical finding.
- Migration/RPC changes have been verified in an isolated environment.

If a gate is missing, the change remains non-production.

## 6. What is deliberately not changed yet

This foundation does not rewrite all feature modules or alter the stable UI.
The existing UI baseline is a compatibility constraint. Migrate one feature at a
time and add a regression contract before changing its state ownership.


## Security boundary rules

- Frontend feature code must use session-token RPCs through the shared web API layer; it must not call legacy privileged RPCs that accept client-supplied school/teacher identity.
- Production database authorization is enforced by RPC/session checks and RLS; UI role checks are convenience gates, not the security boundary.
- Legacy privileged RPCs are treated as backend-only. They are not part of the browser API contract and must not be reintroduced into frontend modules.
- Before changing database grants or removing legacy RPC overloads, verify all backend/n8n callers and stage the change against an isolated Supabase environment. Do not guess that an old RPC is unused.
- Security-sensitive DB changes require verification after the change and must not be rolled directly into production as an experiment.


## Feature authorization migration rule

Feature modules must not send `p_school_id` or `p_teacher_id` as authorization inputs to session-bound `_webRpc` calls. Tenant and actor identity belong to the server-side session context. UI checks such as `window.APP.is_admin` remain a usability/early-rejection layer; the RPC/database authorization remains authoritative.
