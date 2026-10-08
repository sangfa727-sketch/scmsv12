# Public Admission Application Contract

## Required flow

Public subdomain → admission form → isolated admission application store → school admin review → controlled student registration.

## Hard boundary

The public website MUST NOT:
- insert directly into `students`
- update or read students, teachers, parents, attendance, grades, health, billing, transport, library, or staff-chat records
- create an authenticated SCMS staff/student session
- expose service-role credentials

## Application states

`pending` → `reviewing` → `accepted` | `rejected` | `withdrawn`

An accepted application is still NOT a student record. A separate authorized workflow must create the student.

## Tenant isolation

Every application is bound to exactly one `school_id`. The school is resolved server-side from the trusted hostname/site mapping, never from a client-supplied school_id.

## Public submission security

The eventual endpoint must include:
- strict input validation and length limits
- honeypot/bot detection
- rate limiting
- abuse logging without storing unnecessary sensitive data
- server-side school resolution
- RLS or equivalent server-side authorization
- no public SELECT access to application rows
- duplicate/replay protection
- safe document-upload handling if documents are added later

## Current state

The form UI is implemented as a safe frontend contract. It deliberately does not submit to the production database yet.

Next gate: schema review → isolated test environment → RLS/security tests → endpoint runtime test → CI Green → explicit production migration approval.
