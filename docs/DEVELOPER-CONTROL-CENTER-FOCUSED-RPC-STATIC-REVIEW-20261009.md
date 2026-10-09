# DCC — Focused Live RPC Static Review (2026-10-09)

**Project:** SCMS v12 Supabase project `rszgbryucqwmrdbsgwbb`  
**Method:** Read-only catalog query of the nine public SECURITY DEFINER functions identified in the live inventory; reviewed function source excerpts, effective client-role EXECUTE, and pinned search_path.  
**Changes:** No SQL writes, no grants changed, no authentication calls attempted, no student rows queried.  
**Status:** Static risk triage only; findings below are not confirmed exploit reports.

## CI checkpoint

- PR #228 head at the start of this review: `54be58901b5a48669aa6225c7f2f32ff7253e7e1`.
- SCMS tests run [#1962](https://github.com/sangfa727-sketch/scmsv12/actions/runs/37899164297) completed successfully: frontend syntax/regression tests and public website RLS runtime harness passed.
- Playwright was skipped by workflow policy; browser-level behavior is unverified.
- This review creates documentation only. It does not authorize merge or production changes.

## Evidence and triage

All nine reviewed functions are owned by `postgres`, are SECURITY DEFINER, have a pinned search_path, and are effectively executable by both `anon` and `authenticated` according to the live catalog query. That access is not automatically a vulnerability: these are public-facing school sign-in/bootstrap functions, and each requires contract-level review.

| Function | Source-level observation | Priority / next verification |
|---|---|---|
| `rpc_parent_google_login(p_qr_token, p_google_email, p_device_ua)` | Function compares the caller-provided `p_google_email` with `students.parent_email`; the signature/body excerpt does not show Google ID-token verification. The QR token is used to locate an active student, then a parent session is created. | **P1 verify urgently.** Confirm whether a trusted server/provider layer verifies Google identity before this RPC can be reached. If no external verified-identity gate exists, caller-controlled email plus a QR token may permit impersonation. Do not label confirmed until the full call path and negative tests establish reachability. |
| `rpc_email_signup(..., p_invite_code, p_new_school_name)` | Publicly executable SECURITY DEFINER function accepts either an invite code or a new school name; the new-school path creates a school, an `admin` teacher, and a web session. The excerpt has basic email/password/name checks and invite-row locking, but no visible email ownership verification or rate limiter. | **P1/P2 abuse-control review.** Determine whether email verification, gateway throttling, CAPTCHA/abuse controls, and uniqueness constraints exist elsewhere. Test public school creation, duplicate/concurrent requests, and invitation replay in sandbox. Do not blanket-revoke EXECUTE; signup may be an intentional product flow. |
| `rpc_qr_resolve(p_qr_token)` | Resolves an active student QR token and returns student ID, English/local names, class, photo URL, and school name. | **P1 privacy/contract review.** Establish whether QR tokens are high-entropy, non-guessable, revocable, and intended to reveal exactly these fields to unauthenticated scanners. Verify QR rotation and inactive-student behavior in sandbox. |
| `rpc_app_session_poll(p_token)` | Accepts tokens of length at least 16, finds a linked `app_sessions` row, and returns the raw token plus Telegram ID, teacher ID/name, school ID, and status. | **P1 token/session review.** Confirm token generation entropy, expiry/revocation, rate limiting, whether the raw token is needed in the response, and whether linked sessions expose more metadata than required. Minimum length alone is not proof of adequate entropy. |
| `rpc_teacher_card_login_start(p_token)` | Hashes the card token, checks revocation/expiry and teacher-school binding, then creates a two-minute one-time challenge and returns a PIN-required flag. | **P2 follow-up.** Review attempt throttling, card-token entropy, concurrent/replay behavior, and whether card/challenge metadata disclosure is acceptable. |
| `rpc_teacher_web_login(p_challenge, p_password, p_device_ua)` | Locks the challenge row, checks expiry/consumption, validates teacher password and school binding, marks challenge consumed, and creates a web session. | **Positive control present; P2 verify.** Challenge consumption appears guarded by row lock and conditional update. Confirm password-attempt throttling, transaction semantics, and replay/concurrency behavior with sandbox tests. |
| `rpc_email_login(...)`, `rpc_teacher_login(...)`, `rpc_teacher_login_by_login_name(...)` | Password hash verification, active-account checks, and random 32-byte session token generation are visible. No rate-limit/lockout logic appears in the returned function bodies. | **P1/P2 abuse-control review.** Check gateway/shared limiter, lockout/audit systems, credential-stuffing protections, account enumeration, and session expiry/revocation. Do not infer that controls are absent solely because this function body does not contain them. |

## Safe conclusions

1. All nine functions are client-executable SECURITY DEFINER entry points; their exact signatures and bodies need per-function contract checks.
2. The pinned `search_path` reduces one class of object-shadowing risk but does not prove authorization or tenant isolation.
3. No function should be blanket-revoked without mapping its intended frontend/login dependencies and running regression tests.
4. No school-session credential should be accepted as proof of a platform operator identity.
5. Do not expose parent/student data, alter live grants, or create a platform-owner role while the relevant identity boundary remains unproven.


## Session / QR / invite table metadata checkpoint (read-only)

Catalog-only checks were run after the initial function review. No table rows or secret/token values were read.

| Table | RLS / client grants observed | Static interpretation / next check |
|---|---|---|
| app_sessions | RLS enabled, not FORCE RLS. One policy: INSERT to anon, authenticated only when status='pending' and telegram_id IS NULL. Catalog grants also list client-role UPDATE/DELETE and several non-DML privileges. No SELECT policy was found. | **P1/P2 privilege-surface review.** RLS should block client UPDATE/DELETE absent matching policies, but the grants are broader than the apparent intended pending-session insert flow. In a sandbox, verify effective privileges with role-level tests and then propose a narrow grant migration if frontend dependencies permit. Do not change live grants in this pass. Confirm that token generation is server-side/high-entropy and that an attacker cannot reserve or interfere with another user's pending token. |
| app_web_sessions, parent_sessions, teacher_card_login_challenges, teacher_invites | RLS enabled, not FORCE RLS; no policies found. Catalog grants observed only for service_role among the checked API roles; no anon/authenticated table grants appeared. | This is a useful direct-table boundary, but SECURITY DEFINER functions can still access these tables. Verify each function's caller authorization and ensure future policies/grants do not unintentionally broaden access. |
| app_web_sessions | Unique primary key on session_token; index on (teacher_id, expires_at); explicit expires_at column. | Verify every lookup checks expiry and revocation/status consistently, not only index presence. |
| parent_sessions | Unique primary key on session_token; index on student_id; explicit expires_at column. | Verify expiry and parent/student/school binding at every read path. |
| teacher_card_login_challenges | Unique challenge_hash, primary key challenge_id, expiry index restricted to unconsumed rows; consumed_at column exists. | Supports uniqueness/expiry lookup but does not by itself prove atomic one-time consumption; preserve and test row locking plus conditional consume. |
| teacher_invites | Unique primary key on invite_code; index on (school_id, redeemed_at); expiry and redemption columns exist. | Verify expiry, single-use redemption under concurrency, role restrictions, and school binding in the signup function. |
| app_sessions | Unique primary key on token, index on (token, status); no expires_at column was present in the returned column metadata. | **P1/P2 lifecycle question.** Determine whether expiry/revocation is represented by status or handled elsewhere; ensure linked app sessions cannot remain valid indefinitely. Do not assume absence of expiry from this table alone proves an exploitable session. |

### Effective privilege check — app_sessions (read-only)

A direct `has_table_privilege` check confirmed that both `anon` and `authenticated` have effective table-level `INSERT`, `UPDATE`, and `DELETE` privileges on `public.app_sessions`, while neither has `SELECT`. RLS is enabled and the only policy found is the constrained pending-session INSERT policy; no UPDATE or DELETE policy was found. Therefore, row-level policy enforcement is expected to block those UPDATE/DELETE operations for API roles, but the broad grants are unnecessary attack surface and create a future-regression hazard if policies change.

**Proposed first hardening candidate (not applied):** in a separate migration after frontend dependency review, revoke `UPDATE` and `DELETE` on `public.app_sessions` from `anon` and `authenticated`, preserve the intended constrained INSERT flow, and add regression tests proving client UPDATE/DELETE are denied while legitimate pending-session creation and trusted service-side linking still work. Run these tests in a disposable branch/sandbox first. No live grant was changed in this review.

### Metadata limitations

- RLS enabled with no policies plus no client table grants is a useful defense-in-depth signal, not proof that every SECURITY DEFINER RPC is safe.
- Catalog role grants include some PostgreSQL privileges such as TRIGGER/REFERENCES that are not equivalent to direct row access; validate effective SELECT/INSERT/UPDATE/DELETE access specifically in isolated tests.
- These were metadata-only SELECT queries. No grants, policies, rows, tokens, or production data were changed or disclosed.

## Next safe work

1. Trace frontend/API call paths for parent Google login, QR resolution, and signup to determine whether trusted verification exists upstream.
2. Review relevant tables and constraints for QR/token uniqueness, expiry, revocation, and rate-limit/attempt state using metadata only.
3. Write sandbox-only negative tests for forged parent email, invalid/replayed QR/challenge, signup abuse, expired/revoked sessions, and repeated failed login attempts.
4. Record proof and limitations per function before proposing any narrowly scoped migration.
5. Keep production SQL/grants, Production Core, and PR merge unchanged until evidence and explicit approval are in place.
