# SCMS v12 Test Matrix

This is the canonical coverage ledger for automated and manual verification. A test is only marked **PASS** when a recorded run provides evidence. Missing coverage stays **NOT TESTED**; skipped tests are not passes.

## Status definitions
- **PASS** — test ran and met its assertions; link the run/evidence.
- **FAIL** — test ran and an assertion or setup step failed; link the failure evidence.
- **BLOCKED** — dependency, test account, staging environment, or secret unavailable.
- **SKIPPED** — intentionally not run for this execution.
- **NOT TESTED** — no verified test evidence exists yet.
- **PARTIAL** — a limited slice was verified; the complete layer is not covered.

## Latest CI evidence

- Workflow: [SCMS tests run #2131](https://github.com/sangfa727-sketch/scmsv12/actions/runs/37983854094)
- Result: Frontend syntax/regression + dependency audit **PASS**; Playwright local smoke **PASS**; Public Website RLS runtime harness **PASS**; staging E2E **SKIPPED**.
- Playwright coverage: homepage HTTP response/body and presence of 13 core page-shell elements only.
- This run does not prove module interactions, authenticated workflows, database persistence across the full app, role/tenant isolation, or production readiness.

## Test layers

| Layer | Required coverage | Current status |
|---|---|---|
| UI | Route/page renders, controls, navigation, empty/error states | PARTIAL — homepage and 13 page-shell elements only |
| Functional | Validation, create/read/update/delete, filters, exports, workflows | NOT TESTED — module behavior cases not yet verified |
| Integration | Frontend → RPC/API → database; failure handling and persistence | PARTIAL — selected contracts and public Website RLS harness only |
| Security | Authentication, roles/scopes, cross-school isolation, unauthorized requests, secrets exposure | NOT TESTED as a complete matrix |
| Regression | Unit/static/contract tests plus relevant E2E on every PR | PARTIAL — npm test and local homepage/page-shell smoke |

## Module coverage ledger

Every module needs positive, negative, permission, persistence, and regression cases where applicable. **UI PARTIAL means only that the shell exists in the HTML; it does not mean the page was opened or its controls tested.**

| Module | UI | Functional | Integration | Security | Regression |
|---|---|---|---|---|---|
| Dashboard | PARTIAL — shell exists | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Students / Registration / Profiles | PARTIAL — shell exists | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Attendance | PARTIAL — shell exists | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Academics / Timetable / Results | PARTIAL — Grades and Timetable shells exist; other pages not covered | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Homework / Daily Reports | PARTIAL — shells exist | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Communication / Chat | PARTIAL — Parent Messages and Chat shells exist | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Billing | PARTIAL — shell exists | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Admissions | PARTIAL — shell exists | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Library | PARTIAL — shell exists | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Transport | PARTIAL — shell exists | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL — shell assertion only |
| Health | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| School Website / Public RLS | PARTIAL | PARTIAL | PARTIAL — isolated PostgreSQL RLS harness | PARTIAL — RLS harness only | PARTIAL |
| Developer Control Center / AI actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

## Evidence and AI handoff requirements

Each automated run should preserve repository, branch/ref, commit SHA, workflow/run ID, event, timestamp, overall conclusion, test-level results, HTML report, traces/screenshots on failure, relevant server logs, and explicit blocked/untested coverage.

AI summaries must be based on current repository state and run evidence. A successful homepage smoke test or the existence of page-shell elements does not prove business modules or production security work. Do not include production data or credentials in artifacts.
