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
| Functions with PUBLIC-grantee EXECUTE | 0 |
| Client-executable functions whose argument names include `session_token` | 160 anon / 162 authenticated |
| Client-executable functions without an argument named `session_token` | 9 anon / 9 authenticated |

The zero count for unpinned `search_path` is a useful hardening signal, but it does **not** prove that each function has correct authorization, input validation, tenant isolation, or a safe response contract.

The 169/171 executable counts are explicit client-role grants, not proof of anonymous data access by themselves. The absence of PUBLIC-grantee EXECUTE privileges also does not remove the risk of explicit `anon` or `authenticated` grants.

## 2. Functions requiring priority review

The nine client-executable SECURITY DEFINER functions whose argument signatures do not contain an argument literally named `session_token` are:

- `rpc_app_session_poll(p_token)`
- `rpc_email_login(...)`
- `rpc_email_signup(...)`
- `rpc_parent_google_login(...)`
- `rpc_qr_resolve(p_qr_token)`
- `rpc_teacher_card_login_start(p_token)`
- `rpc_teacher_login(...)`
- `rpc_teacher_login_by_login_name(...)`
- `rpc_teacher_web_login(...)`

These names indicate login, sign-up, challenge, QR, or session-polling entry points where a conventional `session_token` parameter may not be expected. Their presence is **not itself a vulnerability finding**. Review the function bodies and contracts for password/challenge verification, token entropy and expiry, rate limiting, enumeration resistance, QR scope, and response-field minimization before drawing conclusions.

## 3. What this means

- A client-executable SECURITY DEFINER function runs with the privileges of its owner, so every exposed function needs a per-function authorization review.
- Several functions intentionally accept a server-issued web session token and perform role/school checks in the body. Their grants may be part of the existing school application contract.
- Internal helper functions such as `_billing_admin_session` and `_billing_session` are not executable by `anon` or `authenticated` in the sampled rows; keep helpers server/internal-only.
- Do not blanket-revoke client grants. Doing so may break school sign-in, bootstrap, billing, chat, attendance, or other production workflows.
- Do not treat an email address or a school-admin role as proof of platform-operator authority.

## 4. Required next classification

For each of the 189 functions, create a signature-level register with:
1. owner and exact ACL/grantee;
2. `search_path` and referenced schemas;
3. session-token validation and expiry/revocation behavior;
4. actor-role binding and school/tenant scope checks;
5. input validation, target-resource authorization, and returned fields;
6. side effects, idempotency, audit coverage, and whether client execution is required;
7. sandbox negative-test evidence for anonymous, parent, teacher, school admin, cross-tenant, expired-session, and revoked-session attempts.

Prioritize account provisioning, password/reset, teacher lifecycle, student/health, billing, exports, chat recipient/department routing, and AI execution RPCs. Record findings before any grant changes.

## 5. Developer Admin provisioning gate

Requested operator: `staillasbi@gmail.com`; intended role: `platform_owner`.

**Not provisioned.** No Supabase Auth user was created, no role was granted, and the supplied sample password was not stored or applied. The safe next step is to establish email ownership through a provider-supported invitation/recovery flow, require MFA, and implement a server-enforced operator boundary that is independent of school-user sessions.

## 6. Release gate

- No production SQL/DDL/grants were changed.
- No Developer Login route was added.
- No school Production Core behavior was changed.
- No PR merge or deployment was performed.
- The latest documentation commit has no associated PR-triggered workflow run returned by the current check; therefore its CI status is **not verified yet**. Earlier workflow success does not certify this newer commit.
- Playwright was skipped by workflow policy; browser-level behavior is not proven.

Continue with evidence-based, read-only classification and sandbox denial tests before implementing or activating platform-owner privileges.
