# Developer Control Center — Initial Action Registry Matrix

**Status:** Proposed catalog for review; not executable policy and not a grant.
**Date:** 2026-10-09
**Purpose:** Define the first DCC action IDs and their minimum enforcement requirements before implementing a trusted server adapter.

## Non-negotiable interpretation

- This matrix does not grant any user access and does not authorize production actions.
- The server must load the approved registry from trusted code or protected server-side storage. Never accept policy, risk, capability, target tenant, or approval state from browser input.
- A verified, explicitly provisioned `platform_owner` is intended to receive every **approved and registered** DCC capability with platform scope. Owner status does not bypass authentication, step-up, confirmation, approval, idempotency, audit, or deny-by-default checks.
- Any action not listed here is denied until separately reviewed, registered, tested, and released.
- School Portal identities remain separate. Student, parent, health, academic, and staff records are not included in the initial DCC data scope.

## Risk and control definitions

| Risk | Meaning | Minimum execution control |
|---|---|---|
| R0 — Read-only | Operational metadata or privacy-safe aggregates | Verified DCC session, active operator, explicit capability, authoritative scope, redacted audit |
| R1 — Reversible change | Low-impact configuration or support workflow change | R0 controls + reason, impact summary, idempotency key, audit outcome |
| R2 — Sensitive operation | Access changes, client suspension, billing changes, exports, or support access | R1 controls + step-up authentication and explicit confirmation; independent approval where policy marks it required |
| R3 — Critical operation | Destructive lifecycle changes, role/permission changes, production deployment, credential/session reset, bulk export | R2 controls + independent action-specific approval, exact target/intent binding, atomic one-time reservation/consumption, rollback/reconciliation plan |

Risk levels are minimums for implementation planning. Security review may raise a risk level; it may not silently lower one.

## Initial action catalog

| Area | Action ID | Scope / target | Risk | Approval | Initial data boundary |
|---|---|---|---|---|---|
| Overview | `overview.read` | Platform | R0 | No | Aggregate health and usage only |
| System health | `system.health.read` | Platform or named service | R0 | No | Service status, sanitized diagnostics |
| System health | `system.incident.read` | Platform or named incident | R0 | No | Redacted incident metadata |
| Clients | `clients.list` | Platform or authorized school/client | R0 | No | Minimal account metadata |
| Clients | `clients.read` | Exact school/client | R0 | No | Account profile and operational status; no student records |
| Clients | `clients.create` | New client | R2 | Yes | Minimum onboarding fields |
| Clients | `clients.update` | Exact school/client | R1 | No by default | Non-sensitive account metadata |
| Clients | `clients.suspend` | Exact school/client | R2 | Yes | Reason and service impact |
| Clients | `clients.reactivate` | Exact school/client | R2 | Yes | Reason and service impact |
| Clients | `clients.archive` | Exact school/client | R3 | Yes | Retention and recovery prerequisites |
| Subscriptions | `subscriptions.list` | Platform or exact client | R0 | No | Plan and status metadata |
| Subscriptions | `subscriptions.read` | Exact subscription | R0 | No | Status, dates, provider references; no payment secrets |
| Subscriptions | `subscriptions.change_plan` | Exact subscription | R2 | Yes | Before/after plan, effective date, reason |
| Subscriptions | `subscriptions.adjust_entitlement` | Exact subscription | R2 | Yes | Entitlement delta and reason |
| Billing | `billing.invoice_status.read` | Exact client/invoice | R0 | No | Status and provider reference only |
| Billing | `billing.refund.request` | Exact payment reference | R3 | Yes | Amount, currency, reason, provider idempotency |
| CRM | `crm.leads.list` | Platform or permitted segment | R0 | No | Consent-filtered lead fields |
| CRM | `crm.leads.read` | Exact lead | R0 | No | Contact fields only for approved purpose |
| CRM | `crm.leads.update` | Exact lead | R1 | No by default | Consent and communication preferences preserved |
| CRM | `crm.leads.export` | Defined filtered dataset | R3 | Yes | Purpose, fields, row limit, expiry, export audit |
| Growth analytics | `growth.metrics.read` | Platform or permitted segment | R0 | No | Aggregated/de-identified metrics |
| Growth analytics | `growth.campaigns.read` | Campaign | R0 | No | Consent-aware delivery/conversion aggregates |
| Support | `support.tickets.list` | Platform or assigned queue | R0 | No | Minimized ticket metadata |
| Support | `support.tickets.read` | Exact ticket | R0 | No | Redacted content; sensitive school records excluded by default |
| Support | `support.tickets.update` | Exact ticket | R1 | No by default | Status, assignment, and response metadata |
| Support | `support.access.request` | Exact client and purpose | R2 | Yes | Time-limited, customer-authorized scope; no implicit impersonation |
| Security & audit | `security.audit.read` | Platform or exact client | R0 | No | Redacted append-only events |
| Security & audit | `security.audit.export` | Filtered audit dataset | R3 | Yes | Purpose, field allowlist, bounded time range |
| Security & audit | `security.operator.read` | Platform | R2 | No by default | Operator identity/status/capabilities; sensitive metadata minimized |
| Security & audit | `security.operator.grant` | Exact operator and role | R3 | Yes | Independent approver; no self-grant |
| Security & audit | `security.operator.revoke` | Exact operator/grant | R2 | No by default | Immediate revocation and audit |
| Settings | `settings.read` | Platform or named setting group | R0 | No | Non-secret configuration only |
| Settings | `settings.update` | Exact setting key | R2 | Yes for security, billing, or identity settings | Typed allowlist; never return secret values |
| Integrations | `integrations.health.read` | Named integration | R0 | No | Health and sanitized error metadata |
| Integrations | `integrations.configure` | Named integration | R3 | Yes | Secret write-only, secret rotation, connectivity verification |
| Release management | `releases.status.read` | Environment/service | R0 | No | Build/deployment status |
| Release management | `releases.deploy.production` | Exact release/environment | R3 | Yes | Verified artifact, explicit diff, rollback plan, post-deploy health check |
| Session security | `security.sessions.revoke` | Exact operator/session | R2 | No by default | Revoke server-side; never reveal session tokens |
| Data governance | `privacy.retention.read` | Platform/data domain | R0 | No | Retention policy metadata |
| Data governance | `privacy.export.request` | Exact subject/dataset | R3 | Yes | Legal basis, purpose, strict field allowlist and expiry |

## Required server-side policy fields

Every executable action definition must include:

- `actionId` (stable unique identifier)
- `enabled` (false until separately reviewed and released)
- `riskTier` and `requiresStepUp`
- `requiresConfirmation` and `requiresIndependentApproval`
- `targetType`, `targetRequired`, and server-side tenant-resolution strategy
- `requiredCapability` and any action-specific approver capability
- `allowedInputSchema` with strict validation and bounded sizes
- `idempotencyRequired` and intent fingerprint rules for side effects
- `auditEventType`, redaction rules, and audit-failure behavior
- `rollbackOrReconciliation` instructions for mutations/external side effects
- `ownerApprovalStatus`, reviewer, test evidence, and release reference

The registry must reject duplicate IDs, unknown risk tiers, missing fields, unsafe defaults, and actions that are marked enabled without review evidence. An action's existence in this proposal does not make it executable.

## Platform-owner completeness tests

The future sandbox integration suite must prove all of the following:

1. The owner can discover and use every **enabled** action in the registry, across the platform scope, when the owner identity is active and verified.
2. Each action still enforces its risk-tier controls; owner status does not bypass step-up, confirmation, independent approval, target binding, or audit.
3. A newly added, disabled, unknown, or unreviewed action is denied.
4. Revoking or disabling the owner takes effect on the next authorization check, including for previously established sessions.
5. A school-scoped operator cannot become platform-scoped through request data or a UI toggle.
6. Cross-tenant targets are resolved from authoritative server data and every accepted/denied attempt has a redacted audit result.
7. Concurrent replay of the same approval/idempotency key cannot execute a high-impact action twice.
8. Audit persistence failure blocks high-risk side effects; external actions use durable reservation and reconciliation.
9. Browser code has no service-role key and no direct privileged-table CRUD.
10. Existing School Portal login, registration, attendance, billing, parent/teacher, chat, and session regressions pass in the isolated sandbox.

## Implementation gates

1. Confirm the trusted operator identity provider and hosting boundary.
2. Turn this proposal into a reviewed, versioned server-side registry with all actions disabled initially.
3. Add only sandbox storage for operator grants, approvals, audit, and idempotency after migration baseline/rollback review.
4. Implement a trusted adapter that resolves identity, action policy, target tenant, approval, and audit from server-owned sources.
5. Execute positive, negative, tenant-isolation, concurrency, audit-failure, and existing-core regression tests.
6. Build the private read-only DCC UI only after the adapter is proven.
7. Enable actions in small risk-based batches after evidence review. Production migration and deployment remain separate explicit approval gates.
