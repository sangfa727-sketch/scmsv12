# Developer Control Center — Draft Role/Action Matrix

**Status:** Design artifact only; not an authorization source or implementation.
**Branch:** `feat/developer-control-center-foundation`
**Last updated:** 2026-10-09
**Release gate:** Every capability remains unavailable until a trusted server adapter, persisted operator registry, database/API enforcement, audit persistence, and negative tests are proven.

## 1. Role definitions

- `platform_owner`: tightly controlled governance and break-glass oversight. Not a routine shared account.
- `platform_admin`: client lifecycle and subscription operations within assigned scope.
- `support_admin`: purpose-bound, time-limited support with minimal client metadata; no unrestricted school-record access.
- `growth_analyst`: consent-aware CRM and aggregated product/growth analytics; no account mutation.
- `read_only_auditor`: read-only security and operational audit views.

These are proposed roles, not current SCMS permissions. A role name alone never grants access; the server must evaluate an explicit capability and target scope for each action.

## 2. Proposed action matrix

Legend: **R** = read; **C** = create; **U** = update; **S** = suspend/disable; **A** = approve; **—** = no access. All permissions are proposals only.

| Action/domain | Owner | Platform admin | Support admin | Growth analyst | Read-only auditor |
|---|---|---|---|---|---|
| Client/school account metadata | R | R/C/U/S within assigned scope | R, limited fields | R, minimum fields | R |
| Subscription/entitlement metadata | R/C/U/S/A* | R/C/U/S within assigned scope | R, limited status | R, aggregated | R |
| Billing operations or refunds | A* | Request only; separate approval required | — | Aggregated metrics only | Audit metadata only |
| CRM leads and acquisition source | R | R | R, purpose-bound | R/C/U for consented CRM records | R |
| Campaign send / bulk outreach | A* | Request only | — | Draft/report only; no send by default | Audit metadata only |
| Aggregated product usage | R | R | R, limited service diagnostics | R | R |
| Individual school operational health | R | R | R, time-limited scope | Aggregated only | R |
| Support ticket metadata | R | R/C/U within assigned scope | R/C/U within assigned scope | Aggregated trends | R |
| Security/audit events | R | R, scoped | Own support actions only | Aggregated trends only | R |
| Operator/role/permission administration | R/C/U/S/A* | Request only; never self-elevate | — | — | R |
| Production deployment / migration | A* (separate explicit release gate) | Request only | — | — | R |
| Student, parent, health, academic, staff-private records | — by default | — by default | — by default | — | — |

`A*` means a separate, explicit approval workflow and step-up authentication are required; this matrix does not authorize the action by itself. For high-impact operations, the requester cannot approve their own request. A platform owner role must not bypass the recorded approval/audit contract.

## 3. Universal enforcement rules

1. Deny by default; unknown actions and unknown role/capability pairs are denied.
2. Authenticate through a provider-verified identity. Do not trust email text, frontend role flags, local storage, URL parameters, or request-supplied operator/approval objects.
3. Load operator status, capabilities, scope, session state, policy, and approval records from trusted server-controlled sources.
4. Bind each operation to an explicit action and target. Enforce tenant scope on the server and database; client-side filtering is not isolation.
5. Check expiry/revocation and rate limits on every privileged request.
6. For approval-gated actions, bind approval to the exact action and target, require a different approver, expire approvals, and atomically consume the approval with the operation and audit event.
7. Record append-only audit metadata: actor, capability, target, reason, correlation ID, outcome, timestamp, and approval reference. Never log passwords, bearer tokens, or unnecessary personal data.
8. Collect only consent-appropriate client/lead/product data for stated operational or marketing purposes. Keep student/parent/health/academic records out of growth datasets; prefer aggregated or de-identified usage metrics.
9. Public school registration must never create a platform operator. Provision operators out-of-band with verified ownership and MFA.
10. A green unit/CI run is necessary but not sufficient: sandbox runtime tests, tenant-isolation tests, review, rollback readiness, and explicit merge/deployment approval remain separate gates.

## 4. Required acceptance tests before any capability is enabled

- Anonymous and ordinary authenticated identities are denied.
- Parent, teacher, school admin, and unprovisioned/disabled operator identities are denied.
- Expired/revoked sessions and revoked operator assignments are denied.
- Missing capability, unknown action, malformed target, and cross-tenant target are denied.
- Client-supplied role, policy, or approval objects cannot change the decision.
- Missing, pending, expired, consumed, mismatched, or self-approved high-risk approvals are denied.
- Concurrent/replayed requests cannot consume the same approval twice or execute the operation twice.
- Audit failure prevents a privileged side effect from being reported as successful; operation, approval consumption, and audit persistence have a defined atomicity/recovery strategy.
- Marketing/CRM exports exclude student, parent, health, academic, and staff-private records.
- Public sign-up cannot grant or modify operator permissions.

## 5. Explicit non-claims

This document does not create an operator, permission, endpoint, database table, migration, grant, or deployment. It is not proof that any proposed role/action is implemented. Reconcile the matrix against real API/RPC signatures and the data classification review before turning it into executable policy.
