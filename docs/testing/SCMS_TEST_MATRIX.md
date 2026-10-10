# SCMS v12 Test Matrix

This is the canonical coverage ledger for automated and manual verification. A test is only marked **PASS** when a recorded run provides evidence. Missing coverage stays **NOT TESTED**; skipped tests are not passes.

## Status definitions

- **PASS** — test ran and met its assertions; link the run/evidence.
- **FAIL** — test ran and an assertion or setup step failed; link the failure evidence.
- **BLOCKED** — a dependency, test account, staging environment, or secret is unavailable.
- **SKIPPED** — intentionally not run for this execution.
- **NOT TESTED** — no verified test evidence exists yet.
- **PARTIAL** — a limited slice was verified; the complete layer is not covered.

## Latest CI evidence

- Workflow run: [SCMS tests run #2204](https://github.com/sangfa727-sketch/scmsv12/actions/runs/38023513053)
- Tested PR head: `4e833bbb37f540b46e7ffb3ae7ca32665a1390f9` (PR #254; merged to main as `a11375d46dc58f014abac16ec6fa018329e8337d`).
- Result: frontend syntax/regression **PASS**; public Website RLS runtime harness **PASS**; local Playwright smoke **PASS**; scheduled/manual-only Playwright **SKIPPED** for this PR run.
- Playwright scope: local homepage/page-shell smoke and mocked Staff Smart Chat UI flows. These tests do not prove real message delivery, authenticated module behavior, full database persistence, role/tenant isolation, or production readiness.

## Test layers

| Layer | Required coverage | Current status |
|---|---|---|
| UI | Route/page renders, controls, navigation, empty/error states | PARTIAL — homepage/page-shell assertions and selected mocked chat UI flows |
| Functional | Validation, create/read/update/delete, filters, exports, workflows | PARTIAL — selected mocked Staff Chat flows only; other module behavior not verified |
| Integration | Frontend → RPC/API → database; failure handling and persistence | PARTIAL — selected contracts and isolated public Website RLS harness only |
| Security | Authentication, roles/scopes, cross-school isolation, unauthorized requests, secrets exposure | NOT TESTED as a complete matrix |
| Regression | Unit/static/contract tests plus relevant E2E on every PR | PARTIAL — frontend regression tests and local Playwright smoke |
| Staging E2E | Authenticated end-to-end tests against a configured staging environment | SKIPPED in run #2204; staging secrets/environment not validated by that run |

## Module coverage ledger

Every module needs positive, negative, permission, persistence, and regression cases where applicable. **UI PARTIAL means only that the shell exists in the HTML or a selected mocked UI flow was tested; it does not mean all controls or live integrations were verified.**

| Module | UI | Functional | Integration | Security | Regression |
|---|---|---|---|---|---|
| Dashboard | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Students / Registration / Profiles | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Attendance | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Academics / Timetable / Results | PARTIAL — selected shell assertions | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Homework / Daily Reports | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Communication / Staff Chat | PARTIAL — mocked All Staff, Direct Chat, Announcements, Inquiry, Groups, Departments, AI preview flows | PARTIAL — mocked UI/API-call assertions only | NOT TESTED against live backend | NOT TESTED as a complete matrix | PARTIAL — selected Playwright flows |
| Billing | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Admissions | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Library | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Transport | PARTIAL — shell assertion | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Health | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| School Website / Public RLS | PARTIAL | PARTIAL | PARTIAL — isolated PostgreSQL RLS harness | PARTIAL — RLS harness only | PARTIAL |
| Developer Control Center / AI actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

## Evidence and AI handoff requirements

Each automated run should preserve repository, branch/ref, commit SHA, workflow/run ID, event, timestamp, overall conclusion, test-level results, HTML report, traces/screenshots on failure, relevant server logs, and explicit blocked/untested coverage.

AI summaries must be based on current repository state and run evidence. A successful homepage smoke test or the existence of page-shell elements does not prove business modules or production security work. Mocked API responses do not prove live message delivery or database persistence. Do not include production data or credentials in artifacts.
