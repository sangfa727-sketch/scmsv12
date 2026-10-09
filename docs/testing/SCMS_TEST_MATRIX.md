# SCMS v12 Test Matrix

This is the canonical coverage ledger for automated and manual verification. A test is only marked **PASS** when a recorded run provides evidence. Missing coverage stays **NOT TESTED**; skipped tests are not passes.

## Status definitions
- **PASS** — test ran and met its assertions; link the run/evidence.
- **FAIL** — test ran and an assertion or setup step failed; link the failure evidence.
- **BLOCKED** — dependency, test account, staging environment, or secret unavailable.
- **SKIPPED** — intentionally not run for this execution.
- **NOT TESTED** — no verified test evidence exists yet.

## Test layers

| Layer | Required coverage | Initial status |
|---|---|---|
| UI | Route/page renders, controls, navigation, empty/error states | IN PROGRESS — homepage smoke only |
| Functional | Validation, create/read/update/delete, filters, exports, workflows | NOT TESTED — module cases not yet mapped |
| Integration | Frontend → RPC/API → database; failure handling and persistence | PARTIAL — selected contracts/RLS only |
| Security | Authentication, roles/scopes, cross-school isolation, unauthorized requests, secrets exposure | NOT TESTED as a complete matrix |
| Regression | Unit/static/contract tests plus relevant E2E on every PR | PARTIAL — existing npm test and homepage smoke |

## Module coverage ledger

Every module needs positive, negative, permission, persistence, and regression cases where applicable.

| Module | UI | Functional | Integration | Security | Regression |
|---|---|---|---|---|---|
| Dashboard | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Students / Registration / Profiles | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Attendance | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Academics / Timetable / Results | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Homework / Daily Reports | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Communication / Chat | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Billing | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Admissions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Library | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Transport | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Health | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| School Website / Public RLS | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Developer Control Center / AI actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

## Evidence and AI handoff requirements
Each automated run should preserve repository, branch/ref, commit SHA, workflow/run ID, event, timestamp, overall conclusion, test-level results, HTML report, traces/screenshots on failure, relevant server logs, and explicit blocked/untested coverage.

AI summaries must be based on current repository state and run evidence. A successful homepage smoke test does not prove business modules or production security work. Do not include production data or credentials in artifacts.
