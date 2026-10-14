# SCMS v12 — Chat Continuation Handoff

Last updated: 2026-10-14

## Resume trigger
When the user starts a new chat and says **“SCMSv12 အတွက် project ဆက်စီစစ်မယ်”** (or asks to continue SCMS v12), resume this audit from the latest GitHub/Supabase state. Do not ask the user to repeat the scope or constraints unless a genuinely new decision is required.

## User's standing scope
- Audit SCMS v12 multi-school readiness for the non-AI application layer.
- Prioritize manual Student, Teacher, Parent data entry/edit/delete/view flows, tenant isolation, authorization, privacy, login/session identity, and regression tests.
- AI Universe / AI execution layer is out of scope unless the user explicitly expands scope.
- Keep Burmese as the response language.

## Safety / authorization constraints
- Production Supabase project: `rszgbryucqwmrdbsgwbb`.
- GitHub repository: `sangfa727-sketch/scmsv12`.
- Audit Production read-only: do not modify Production schema, data, configuration, storage bucket settings, or deployed Edge Functions without explicit separate approval.
- Do not create a Supabase Development Branch unless explicitly requested.
- Do not deploy migrations or Edge Functions during the audit.
- PR #316 must not be merged.
- PR #317 must not be merged while security/rollout blockers remain. A green CI run is not sufficient evidence for safe Production rollout.
- Avoid blind migration application: repo migration files and Production migration history have substantial ID/name drift. Reconcile migration history before proposing any rollout.
- Use only the current security-audit branch for authorized PR-scoped code/tests/docs work; do not commit audit fixes directly to `main`.

## Current working PR
- PR #317: https://github.com/sangfa727-sketch/scmsv12/pull/317
- Branch: `fix/security-audit-upload-validation` → `main`
- Purpose: harden upload validation, minimize Parent Portal payloads, restrict parent login RPC, revoke browser direct mutation rights on internal tables, harden invite/school ID concurrency, and add runtime tests.
- Most recent known workflow run: https://github.com/sangfa727-sketch/scmsv12/actions/runs/38586377345
- At last check, all 11 automatic jobs completed successfully, including the Non-AI tenant identity/student CRUD runtime test and automatic Playwright local smoke test. The scheduled/manual-only Playwright job was skipped by design.
- Verify latest PR head SHA and latest CI status before any further edits or merge decisions.

## Confirmed blockers / findings to revisit
1. **Public student photo bucket:** `student-photos` remains publicly readable by object URL. Upload authorization does not make existing photo URLs private. Needs a carefully planned private bucket + signed URL + UI integration, plus compatibility/rollback analysis.
2. **Telegram/n8n login fallback:** deployed n8n workflow and fallback behavior are not confirmed from accessible repository evidence. Verify actual deployed workflow with authorized access before claiming end-to-end login works.
3. **Telegram connect identity checks:** Production `rpc_telegram_connect_start` / `rpc_telegram_connect_finish` require deeper review of current teacher status, school and role binding. A test was added on the security branch for stale school/role/inactive sessions; verify whether it is in the latest head and that it passes.
4. **Production migration drift:** recent repo migrations are not present in Production migration history; there are many migration filename/name mismatches. Do not apply migrations until reconciliation is done.
5. **Teacher web session invalidation:** repo has a migration for invalidating stale sessions after teacher school/role/status changes, but Production did not have the corresponding triggers at last check.
6. **Billing identity binding:** hardening migration is in repo/PR history but not recorded as applied in Production. PR #316 is not to be merged.
7. **Parent Google login abuse controls:** endpoint rate limiting/monitoring needs separate review.
8. **Supabase owner/default ACL findings:** broad `supabase_admin` default ACLs and diagnostic view grants need authorized owner/admin review; do not attempt privilege escalation.
9. **End-to-end CRUD:** complete realistic Student/Teacher/Parent create, read, update, delete/deactivate, role/permission, cross-school isolation, and session-revocation tests before declaring production-ready.

## Additional Production findings
- `rpc_parent_google_login(text,text,text)` was executable by anon/authenticated and returned the entire student row (`to_jsonb(v_student)`) at the last read-only check. PR #317 changes its ACL and payload, but these changes are not applied to Production.
- `app_sessions`, `audit_log`, and `n8n_state` had browser-role mutation grants at the last check. PR #317 revokes them; verify that registration/login fallback continues to work through trusted server-side service-role flow.
- Production had no matching `20261013...` / `20261014...` migration history entries at the last check.
- `student-photos` public read access is a confirmed privacy design issue; other heuristic SECURITY DEFINER candidates require validation before labeling them vulnerabilities.

## Next steps on resume
1. Read this handoff and inspect current PR #317 head, status, changed files, reviews, and CI jobs.
2. Confirm current run completion; inspect logs for failures, especially session identity, parent portal payload, non-AI tenant/CRUD, and Playwright.
3. Review Telegram connect RPC definitions and branch test coverage; patch only the security branch if safe and run tests again.
4. Continue read-only Production audit of Student/Teacher/Parent CRUD RPC definitions, grants, permission helper behavior, tenant scoping, payload minimization, audit logging, and stale sessions.
5. Prepare a staged rollout plan that explicitly resolves migration drift, photo privacy, n8n/login verification, and rollback/monitoring.
6. Do not merge or deploy while blockers remain. If a later merge becomes appropriate, state exact evidence and risk first; require explicit approval for Production rollout separately.

## Communication
- Give concise but meaningful Burmese updates.
- Separate confirmed findings from hypotheses/test candidates.
- Never invent readiness percentages. If a percentage is requested, define a risk-weighted method and explain uncertainty.
- State clearly that local/CI success is not the same as Production verification.
