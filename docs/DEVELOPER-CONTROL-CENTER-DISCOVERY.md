# Developer Control Center — Phase 0 Discovery Findings

**Date:** 2026-10-09  
**Repository branch:** `feat/developer-control-center-foundation`  
**Status:** Partial discovery complete; implementation is blocked pending auth/RPC grant review.  
**Scope:** Read-only inspection only. No production schema, grants, account records, or application code changed.

## 1. CI / PR checkpoint

- PR #228 remains open and unmerged.
- Workflow run #1930 completed successfully for the frontend syntax/regression job and public website RLS runtime harness.
- Playwright was skipped by the workflow's scheduled/manual-only policy; browser-level coverage is therefore not proven by this run.
- Passing this workflow verifies the documentation branch did not break those checks; it does not prove the proposed Developer Console is secure or implemented.
- PR merge remains a separate user-approval gate.

## 2. Frontend and current identity flow

Evidence reviewed:
- `js/00_env.js` explicitly states that environment selection is not an authorization boundary.
- `js/02B_api_auth.js` contains both an n8n bootstrap flow and a direct Supabase `rpc_web_bootstrap` call that uses the public anon key and a web session token.
- `index.html` is the existing shared static frontend entry point.
- `package.json` identifies this as a static HTML/CSS/JavaScript frontend with syntax, static, and contract tests.

Implications:
- Do not add Developer UI or links to the public School Login/Sign Up experience.
- A hidden route or a client-side role flag cannot protect privileged access.
- The current web-session-token and Supabase RPC patterns must be traced end-to-end before choosing whether DCC uses a dedicated identity provider/tenant, a server-side operator API, or another boundary.
- A separate admin subdomain is a preferred deployment target only if its host/server and API enforce access controls; the URL itself is not security.

## 3. Live database security-advisor findings

The live Supabase Security Advisor returned:
- 44 `rls_enabled_no_policy` informational findings.
- 2 `extension_in_public` warnings.
- 2 `pg_graphql_anon_table_exposed` warnings.
- 2 `pg_graphql_authenticated_table_exposed` warnings.
- 169 `anon_security_definer_function_executable` warnings.
- 171 `authenticated_security_definer_function_executable` warnings.

A read-only query of `public` SECURITY DEFINER functions confirmed that multiple functions currently have EXECUTE ACLs for `anon` and/or `authenticated`. Some RPCs may intentionally accept and validate an application session token; the grant alone does not prove an exploitable vulnerability. However, these grants are a hard review gate because SECURITY DEFINER functions execute with their owner's privileges.

Required next action:
1. Build an exact function/signature inventory and compare it with the latest migration history and intended client-call contract.
2. For each function, inspect body, owner, `search_path`, session validation, role/school binding, tenant scope, returned fields, and whether anonymous execution is required.
3. Verify live ACLs against repository migrations, including the RPC grant cleanup and later deliberate client-execute restorations.
4. Test expected anonymous/teacher/parent/school-admin/cross-tenant denials in a sandbox.
5. Change grants only with function-by-function evidence and regression tests. Do not blanket-revoke, because that could break valid school login, bootstrap, and existing workflows.

Advisor reference: https://supabase.com/dashboard/project/rszgbryucqwmrdbsgwbb/advisors/security

## 4. Data / permission boundary is not yet ready

Before adding DCC tables or privileged endpoints, determine:
- Whether platform operator identities can be represented without granting a school tenant role.
- Which identity claim is server-trusted and how it is revoked.
- How operator role assignments are provisioned out-of-band and protected from public sign-up, school administrators, and ordinary authenticated users.
- Whether the existing session-token functions bind the token to a school, actor, action, and tenant on every call.
- Which current tables contain student, parent, health, billing, or staff personal data and must be excluded from growth analytics.
- Which deployment option can enforce private DCC entry and protect server-side secrets.

## 5. Next safe work items

1. Continue read-only inventory of sensitive SECURITY DEFINER functions and the current grant migrations.
2. Produce a role-to-action matrix for DCC, including read-only first-release scope.
3. Add sandbox-only negative authorization tests for anonymous and non-operator identities.
4. Only after the above are evidenced, design the operator identity and audit schema.
5. Build a read-only DCC MVP behind the approved server-side boundary.
6. Require CI Green, security review, tenant-isolation tests, and explicit merge/deployment approval.

## 6. Explicit non-actions

- No live Supabase migration was applied.
- No production function grants were modified.
- No Developer Login route or link was added.
- No production account or student data was read or exported.
- No PR was merged.
