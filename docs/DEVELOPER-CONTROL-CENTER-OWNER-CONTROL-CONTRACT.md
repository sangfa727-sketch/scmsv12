# Developer Control Center — Platform Owner Control Contract

**Status:** Implementation contract for the DCC foundation PR  
**Scope:** Platform-wide operator authority, not a production grant or deployment  
**Safety:** This document changes no live database, user account, school data, or production service.

## Product requirement

The verified and explicitly provisioned `platform_owner` must be able to oversee and operate every registered SCMS system area from the private Developer Control Center. This includes system health, client/school lifecycle, subscriptions, CRM and growth analytics, support operations, security/audit, configuration, and the registered action catalog.

“Control all systems” means broad platform-wide authority through the same server-enforced policy boundary. It does **not** mean bypassing authentication, permission checks, tenant resolution, audit, confirmation, or approval controls.

## Owner authority model

1. **Provisioning only:** Owner status is granted out-of-band after identity ownership verification and MFA enrollment. Public school signup, frontend settings, local storage, query parameters, or a caller-supplied role can never create or elevate an owner.
2. **Server-owned role mapping:** The trusted backend resolves the verified identity, active operator record, role grants, and capability list on every request. The owner role maps to every currently approved DCC capability in the server-owned permission registry; new action IDs do not become executable merely because a caller asks for them.
3. **Platform scope:** The active owner has platform-wide scope and may target any authoritative school/client ID. The backend must resolve the target from trusted data and record its tenant context; never trust a browser-supplied tenant ID as proof.
4. **No implicit wildcard:** Each action must exist in the registry and be included in the effective capability set. Unknown actions and missing policy entries fail closed.
5. **Risk-based execution:** Read-only and low-risk actions can run when authorized. Destructive actions, privilege changes, exports, billing changes, credential/session resets, and production deployments require explicit impact confirmation, a reason, step-up authentication and/or independent approval according to the reviewed risk matrix.
6. **No self-approval:** The requester cannot approve their own high-risk request. The approver must be active, in scope, and hold the action-specific `approve:<action>` capability. If an emergency break-glass path is later required, it must be separately designed, narrowly scoped, time-limited, and independently audited; it must not be an undocumented bypass.
7. **Audit and recovery:** Every accepted or denied privileged attempt produces a redacted, server-generated audit record. Side effects use idempotency keys and transactional audit/approval consumption where supported. Tokens, passwords, secrets, and sensitive student/parent payloads must not be logged.
8. **Identity separation:** School admin, teacher, parent, and student identities never become platform operators by virtue of their school role. DCC sessions and authorization are separate from School Portal sessions.
9. **Production boundary:** The owner can manage registered systems through approved APIs; the browser never receives service-role credentials and never writes directly to privileged tables. Existing Production Core behavior remains unchanged until a separately reviewed migration/release is approved.

## Minimum acceptance tests

- An active platform owner with the explicit complete capability set can access each registered system area across school boundaries.
- A disabled, revoked, expired, unverified, or unprovisioned identity is denied, including a previously valid session after revocation.
- A platform owner missing a capability in the effective server-loaded permission set is denied that action.
- Unknown or newly introduced action IDs are denied until registered and granted through the reviewed policy registry.
- The owner cannot turn a school-scoped identity into a platform-scoped identity using request data.
- High-risk actions are denied without a valid, unexpired, unconsumed approval bound to the exact action, target, tenant, requester, and request intent.
- Self-approval, wrong-scope approvers, approval replay, changed target, changed action, and concurrent double-consumption are denied.
- Every success and denial has a redacted audit outcome; audit persistence failure blocks high-risk side effects.
- School Portal login, attendance, billing, chat, parent, teacher, and session behavior remains unchanged.
- All acceptance tests run in an isolated sandbox before any production migration or deployment.

## Delivery order

1. Complete read-only auth/RPC/grant and hosting review.
2. Implement the server-side DCC identity and authorization adapter; keep the current pure policy helper as a decision contract, not as the endpoint.
3. Add sandbox-only schema/migrations for operator grants, approvals, and append-only audit after the baseline and rollback path are confirmed.
4. Verify negative authorization, tenant isolation, approval concurrency/replay, audit atomicity, and existing SCMS regressions.
5. Build the private responsive DCC shell and read-only overview on top of the verified API.
6. Add controlled actions by risk tier; add CRM/growth analytics using purpose-limited, privacy-safe data.
7. Require CI green, evidence review, explicit merge approval, and separate explicit production migration/deployment approval.

## Current implementation status

The authorization helper and unit tests are a pure in-repository contract. They are not yet a trusted HTTP API, a persistent operator directory, a deployed UI, or proof of production authorization. A passing unit test does not replace sandbox integration and runtime verification.
