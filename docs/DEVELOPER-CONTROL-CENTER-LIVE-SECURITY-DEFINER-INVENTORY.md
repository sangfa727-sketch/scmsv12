# Developer Control Center — Live SECURITY DEFINER Inventory Check

**Checked:** 2026-10-09  
**Project:** SCMS v12 Supabase project `rszgbryucqwmrdbsgwbb`  
**Method:** Read-only SQL catalog inventory; no table data, credentials, or student records queried.  
**Production changes:** None.

## 1. Live inventory summary

A read-only query against `pg_proc`, `pg_namespace`, ACL expansion, and role privilege checks returned:

| Measure | Live count |
|---|---:|
| `public` SECURITY DEFINER functions | 189 |
| Functions executable by `anon` (effective) | 169 |
| Functions executable by `authenticated` (effective) | 171 |
| Functions with no pinned `search_path` | 0 |

The zero count for unpinned `search_path` is a useful hardening signal, but it does **not** prove that each function has correct authorization, input validation, tenant isolation, or a safe response contract.

The live ACL check found no PUBLIC-grantee EXECUTE privileges in this inventory; the 169/171 executable counts are explicit client-role grants, not proof of anonymous data access by themselves.

## 2. What this means

- A client-executable SECURITY DEFINER function runs with the privileges of its owner, so every exposed function needs a per-function authorization review.
- Several functions intentionally accept a server-issued web session token and perform role/school checks in the body. Their grants may be part of the existing school application contract.
- Internal helper functions such as `_billing_admin_session` and `_billing_session` are not executable by `anon` or `authenticated` in the sampled rows; keep helpers server/internal-only.
- Do not blanket-revoke client grants. Doing so may break school sign-in, bootstrap, billing, chat, attendance, or other production workflows.
- Do not treat an email address or a school-admin role as proof of platform-operator authority.

## 3. Required next classification

For each of the 189 functions, create a signature-level register with:
1. owner and exact ACL/grantee;
2. `search_path` and referenced schemas;
3. session-token validation and expiry/revocation behavior;
4. actor-role binding and school/tenant scope checks;
5. input validation, target-resource authorization, and returned fields;
6. side effects, idempotency, audit coverage, and whether client execution is required;
7. sandbox negative-test evidence for anonymous, parent, teacher, school admin, cross-tenant, expired-session, and revoked-session attempts.

Prioritize account provisioning, password/reset, teacher lifecycle, student/health, billing, exports, chat recipient/department routing, and AI execution RPCs. Record findings before any grant changes.

## 4. Developer Admin provisioning gate

Requested operator: `staillasbi@gmail.com`; intended role: `platform_owner`.

**Not provisioned.** No Supabase Auth user was created, no role was granted, and the supplied sample password was not stored or applied. The safe next step is to establish email ownership through a provider-supported invitation/recovery flow, require MFA, and implement a server-enforced operator boundary that is independent of school-user sessions.

## 5. Release gate

- No production SQL/DDL/grants were changed.
- No Developer Login route was added.
- No school Production Core behavior was changed.
- No PR merge or deployment was performed.
- CI success on the documentation commit is not runtime proof; Playwright was skipped by workflow policy.

Continue with evidence-based, read-only classification and sandbox denial tests before implementing or activating platform-owner privileges.
