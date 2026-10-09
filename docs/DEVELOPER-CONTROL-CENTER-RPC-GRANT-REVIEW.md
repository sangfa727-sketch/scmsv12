# Developer Control Center — RPC Grant Review & Phase 1 Gate

**Date:** 2026-10-09  
**Status:** Read-only review; implementation remains blocked until the operator identity boundary is proven.  
**Production changes:** None.

## 1. Current PR / CI

- PR #228 is open and unmerged.
- Latest head: `25082e7bf83f006c98b0a80ea126fbf0192017dc`.
- SCMS tests workflow run `37893637331` completed with conclusion `success`.
- The run's workflow policy skips Playwright, so browser-level behavior is not proven by that run.
- CI success covers the repository's configured checks only; it does not approve the design or prove DCC security.

## 2. Grant review — important distinction

Reviewed repository migrations include:
- `20260929063000_web_session_role_binding_hardening.sql`
- `20260929063010_web_session_rpc_client_execute_restore.sql`
- `20261003012000_auth_function_grants_and_challenge_rls.sql`
- `20261003080000_admin_rpc_public_grants_cleanup.sql`
- `20261004090001_revoke_rpc_public_execute.sql`
- `20261004090002_lock_down_postgres_default_client_grants.sql`
- `20261007110000_revoke_internal_public_views_client_grants.sql`

Findings:
1. The blanket PUBLIC EXECUTE cleanup revokes implicit PUBLIC grants for `rpc_%` functions; explicit grants can still permit `anon` or `authenticated` execution.
2. The repository intentionally restores client execution for selected web-session/auth RPCs whose bodies validate a server-issued session token. Therefore an advisor finding is not, by itself, proof that a function is exploitable.
3. `rpc_web_session_verify` and `rpc_change_password` are explicitly restored to client roles in the later migration after a prior revoke. Their token/session checks and their exposed response/action contract need review before using this pattern for platform operators.
4. Existing school-user sessions are teacher/school-bound. Do not reuse a teacher session token as a platform-operator credential or infer platform privileges from a school role.
5. The default-privilege migration prevents future objects owned under the covered `postgres` role from automatically receiving broad client grants, but does not replace per-function review of existing objects or objects created under other owners.

## 3. Proposed Developer Console authorization matrix (draft)

| Capability | platform_owner | platform_admin | support_admin | growth_analyst | read_only_auditor |
|---|---|---|---|---|---|
| View aggregated platform metrics | Yes | Yes | Limited | Yes | Yes |
| View client account metadata | Yes | Yes | Assigned clients only | Minimized | Read-only / approved scope |
| Change subscription/entitlements | Approval + audit | Scoped + audit | No | No | No |
| Suspend/reactivate client | Step-up + reason + audit | Approval + audit | No | No | No |
| Access student/health/academic records | Deny by default; separately approved break-glass only | No | No by default; purpose-bound support only if approved | No | No |
| Export client/student data | Dual approval + strict scope | Approval + strict scope | No by default | Aggregated/de-identified only | No by default |
| Manage operator roles | Dual-control; cannot silently self-elevate | No | No | No | No |
| View audit logs | Yes | Scoped | Own support actions | Growth-only relevant events | Yes, read-only |
| Provision/revoke operator accounts | Controlled out-of-band flow | No | No | No | No |

This matrix is a proposed baseline and must be reviewed against operational/legal requirements before implementation. All "Yes" entries still require server-side authorization, tenant/scope checks, audit, and any configured step-up/approval controls.

## 4. Required next discovery tests

Before adding a Developer login or database schema:
1. Inventory each SECURITY DEFINER function that is executable by `anon` and/or `authenticated`: full signature, owner, ACL, `search_path`, source body, input validation, session binding, tenant binding, response fields, and business side effects.
2. Classify each function as: public bootstrap/auth-required, school-session-bound, authenticated user, privileged school-admin, internal service-only, or deprecated.
3. Reconcile live migration history with repository migrations and explicit grant restorations.
4. In a sandbox, prove: public sign-up cannot provision platform roles; school admin cannot self-elevate; teacher/parent/anonymous sessions are denied DCC endpoints; revoked/expired operator sessions are denied; cross-tenant client IDs are rejected.
5. Choose the operator identity boundary only after hosting and server-side API capabilities are confirmed.

## 5. Go / no-go

**No-go for privileged DCC implementation at this stage.** The repository and database show a deliberate, nuanced mix of PUBLIC revokes and explicit client-role grants for session-validated RPCs. The safe next step is function-by-function evidence and sandbox negative tests, not a blanket grant change or a frontend-only hidden route.

No live SQL was run to change data or permissions. No production migration, operator account, or privileged endpoint was created.
