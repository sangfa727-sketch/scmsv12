# SCMS v12 Developer Control Center — Foundation Plan

**Status:** Design / implementation gate (no production code or database changes yet)  
**Owner:** SCMS Platform Owner  
**Repository:** `sangfa727-sketch/scmsv12`  
**Last reviewed:** 2026-10-09

## 1. Product decision

Build one SCMS platform with two deliberately separated experiences:

- **School Portal:** existing school-facing app and its existing login, registration, parent, teacher, and staff flows.
- **Developer Control Center (DCC):** a private operations console for explicitly provisioned platform operators.

Do not add a Developer Login link, role selector, or Developer mode entry to public login/sign-up pages or school navigation. Do not expose a hidden-but-public UI as a security control.

## 2. Architecture decision

The current repository is a static HTML/CSS/JavaScript frontend. Its environment selector explicitly states that frontend environment selection is not an authorization boundary. Therefore:

1. Keep existing school frontend and Production Core behavior unchanged.
2. Implement DCC as a separately deployed admin surface (preferred: dedicated admin subdomain with hosting/server access controls), or a separately protected route only if the hosting and backend provide equivalent server-enforced controls.
3. Treat all browser code and public assets as public. Never put secrets, privileged keys, allowlists that grant access, or trusted role decisions in frontend code.
4. Use a server-side API / narrowly scoped database RPC boundary for DCC actions. Browser-supplied role claims and local storage values are never authorization.
5. Reuse the existing Supabase project only after schema, grants, function ownership, and tenant boundaries have been reviewed. Add DCC-specific tables and functions in migrations; do not query or mutate school production tables directly from the browser.
6. Keep n8n workflows out of the authorization trust boundary. Any workflow invoked by DCC must revalidate the caller and action server-side.

## 3. Identity and access model

Provision operator identities out-of-band; public sign-up must never create a platform operator.

Suggested roles (final permissions require a reviewed matrix):

- `platform_owner`: tightly controlled break-glass and platform governance.
- `platform_admin`: approved client lifecycle and subscription operations.
- `support_admin`: time-limited, purpose-bound support actions; no unrestricted student/health data access.
- `growth_analyst`: aggregated and consent-appropriate CRM/marketing analytics; no account mutation.
- `read_only_auditor`: read-only audit and operational reports.

Requirements:

- MFA for all operators; phishing-resistant MFA preferred where supported.
- Least privilege, explicit server-side authorization, session expiry/revocation, rate limiting, and secure recovery.
- Separate permissions for read, create, update, suspend, export, impersonation/support access, and billing operations.
- No routine impersonation. If a support session is later approved, require customer authorization, reason, scope, expiry, visible audit trail, and automatic revocation.
- Sensitive actions require step-up authentication and/or second-person approval based on risk.
- No plaintext password access; use provider-supported reset/recovery flows.
- Record actor, action, target tenant/client, reason, request/correlation ID, timestamp, outcome, and approval metadata in append-only audit records. Do not log credentials, access tokens, or sensitive student payloads.

## 4. Data and privacy boundaries

Initial data domains:

- Client / school account metadata and operational status.
- Subscription plan, entitlement, renewal, invoice/payment status references.
- CRM leads, acquisition source, consent and communication preferences.
- Aggregated product usage, reliability metrics, support tickets and feature requests.
- Security audit events.

Guardrails:

- Keep student, parent, staff, health, and academic records out of marketing datasets.
- Collect only necessary fields; define purpose, retention, deletion/export handling, consent, and access policies before enabling collection.
- Prefer aggregated/de-identified product analytics.
- Enforce tenant isolation in the database/API; never rely on frontend filtering.
- No production data exports or cross-tenant browsing until the exact permission, approval, and audit controls pass tests.

## 5. Delivery phases

### Phase 0 — Discovery and threat model (current gate)
- Inventory current authentication/session flow, roles, RPCs, grants, RLS, hosting, CI, and deployment path.
- Reconcile live Supabase migrations with repository migrations and identify security-advisor findings relevant to the proposed boundary.
- Define threat model, operator roles/permissions, data classification, and release acceptance tests.
- No production DDL, account changes, privileged frontend route, or public deployment.

### Phase 1 — Secure foundation
- Add DCC-specific identity/authorization boundary and append-only audit contract.
- Create sandbox migration and test fixtures only after Phase 0 review.
- Add negative tests for anonymous, school-admin, teacher, parent, cross-tenant, expired-session, and revoked-operator access.
- Prove public sign-up cannot grant operator roles.

### Phase 2 — Read-only MVP
- Secure DCC sign-in at a separate entry point.
- Read-only overview, client directory, client detail metadata, subscription state, service health and audit views.
- No sensitive student/parent data and no account mutation initially.

### Phase 3 — Controlled operations
- Client lifecycle and subscription actions through audited server-side commands.
- Reason capture, idempotency, approval/step-up rules, replay protection, and recovery.
- No direct browser writes to privileged tables.

### Phase 4 — CRM and Growth
- Lead capture, source attribution, demo/trial pipeline, consent-aware campaign reporting, conversion and renewal metrics.
- Product analytics must avoid collecting sensitive school records.

### Phase 5 — Intelligence and automation
- AI-generated summaries, renewal/churn signals, feature demand and support triage.
- AI may recommend; high-impact actions remain approval-gated and execute through the same policy-enforced API/RPC boundary.
- Monitor false positives, data access, cost, and automation failures.

## 6. UI/UX contract

- Premium compact enterprise interface; responsive for desktop, tablet and mobile.
- Dedicated DCC shell, separate navigation and session state from the School Portal.
- Main areas: Overview, Clients, Subscriptions, CRM & Leads, Growth Analytics, Support, System Health, Security & Audit, Settings.
- Clear environment indicator; never infer environment or authorization from query parameters.
- All sensitive actions use explicit target confirmation, reason, impact summary, and approval/step-up when required.
- Accessible labels, keyboard operation, loading/empty/error states, pagination, filters, and safe error messages.
- Public School Login/Sign Up must remain unchanged and must never show DCC links or controls.

## 7. Required verification gates

Before any merge:
- Existing `npm test` passes; add targeted unit/contract tests.
- Verify existing School Login, Sign Up/registration, parent, teacher, staff, chat, and session flows are unchanged.
- Negative authorization tests prove deny-by-default for every unprovisioned or insufficiently privileged identity.
- Verify tenant isolation at the server/database boundary, not just in UI.
- Verify audit coverage, secret redaction, rate limiting, session revocation and replay/idempotency behavior.
- Review Supabase security/performance advisors and investigate findings; do not blanket-revoke existing grants or policies without per-function/table impact analysis.
- CI Green plus runtime evidence is required. Playwright may be skipped only if explicitly blocked, and the skipped coverage must be reported.
- Production database migration, deployment, and PR merge are separate approval gates. Never merge without explicit user approval.

## 8. Explicit non-goals for the first release

- No public Developer Login or public operator registration.
- No browser-held service-role key or other privileged secret.
- No direct mutation of the existing school Production Core.
- No unrestricted impersonation or student/health-data browsing.
- No production database migration until the discovery/threat-model gate is reviewed.
- No automatic AI execution of high-impact account, billing, or data-export actions.

## 9. Definition of ready for Phase 1

Phase 0 is complete only when the current auth/session flow, live database permissions and RPC surface, hosting options, role matrix, tenant boundaries, and test strategy have been inspected and written down with evidence. Unknowns must remain blockers, not be assumed safe.


## 10. Dedicated DCC database model — proposal only

This section is a design proposal, not a migration. No production tables or privileges have been changed. A read-only check found no table names matching `developer_%` in the `public` or `private` schemas; this does not rule out differently named objects in other schemas.

Proposed core tables, preferably in a schema not exposed through the public API after confirming project conventions:

| Table | Purpose |
|---|---|
| `developer_operators` | Maps an existing verified identity to an enabled or disabled platform operator. |
| `developer_operator_roles` | Records explicit role grants, revocations, grantor, timestamps and reason. |
| `developer_role_permissions` | Maps each role to individual capability codes and risk levels. |
| `developer_audit_logs` | Server-generated, append-only action history with actor, target, tenant scope when relevant, reason, request ID, outcome and redacted metadata. |
| `developer_action_approvals` | Short-lived, single-use approvals bound to an exact high-risk action, target, request ID, expiry and approver. |

Do not add a separate session table unless the selected identity architecture proves it necessary. Never store passwords, password hashes, recovery codes, access tokens, refresh tokens or privileged secrets in these tables.

## 11. Sandbox acceptance gates

- Public signup, anonymous users, parents, teachers, school admins, unprovisioned operators and disabled operators must be denied DCC access.
- Expired/revoked sessions, insufficient permissions, cross-tenant targets, expired/consumed approvals and prohibited self-approval must be denied.
- Server-side authorization must derive identity from a verified session and check operator status, capability, target scope and approval on every request. No direct browser CRUD to privileged DCC tables.
- Audit entries must be server-generated, append-only to application roles and redact secrets and sensitive student/parent data.
- Re-test existing school login, attendance, billing, chat and core RPC flows after sandbox changes.
- Confirm identity-provider schema, current migration baseline, rollback method and CI migration tests before creating a sandbox migration.

`staillasbi@gmail.com` must not receive `platform_owner` until email ownership is verified, MFA is enforced, the permission matrix is reviewed and negative tests pass. Production migration, deployment and PR merge remain separate approval gates.
