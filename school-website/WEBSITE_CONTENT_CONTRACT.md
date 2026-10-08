# SCMS v12 — Public Website Content Contract

## Purpose

The public school website is a presentation layer for **published public school information**. It is not a second interface to the private SCMS data model.

## Data boundary

Public website content may include:

- school profile and public description
- public programs and facilities
- published news and announcements
- published events
- public gallery/media metadata
- admissions information
- public contact information
- public location information

The public website MUST NOT read or expose:

- students or student profiles
- parents/guardians as SCMS records
- teachers or private staff records
- attendance
- grades/exams/academic results
- health records
- billing/payments
- transport/private routes
- library/private circulation records
- staff chat or internal communication
- authentication/session secrets
- service-role credentials

## Publication state

Website content follows:

`draft → preview → review → published → archived`

Only `published` content is eligible for public rendering.

A draft, preview, or review record MUST NOT become publicly readable by changing a client-side flag or URL parameter.

## Tenant isolation

Every public-content record belongs to exactly one `school_id`.

The public request host determines the trusted school/site identity. The client MUST NOT be allowed to choose a different `school_id` in a public read request.

The server-side resolver must reject:

- unknown hosts
- inactive schools/sites
- malformed host mappings
- cross-school content requests

## Proposed isolated content boundary

The implementation should use dedicated `website_*` records rather than direct reads from private SCMS tables.

Planned logical resources:

- `website_school_profiles`
- `website_pages`
- `website_programs`
- `website_facilities`
- `website_news`
- `website_events`
- `website_gallery`
- `website_admission_info`
- `website_contact`
- `website_sites` (trusted hostname/custom-domain mapping)

Exact physical schema is a separate review gate.

## Admin workflow

SCMS staff manage public content through an authorized Website workspace:

`draft → preview → review → publish`

Publishing must be authorized server-side and must record the publishing actor and timestamp.

A public visitor has read-only access to published content for the resolved school.

## Admission separation

Public admission applications are intake records and remain separate from Student Core records.

`public website → isolated application intake → school review → controlled conversion → Student Core`

An accepted application is not automatically a student.

## Security gates before production data access

1. Finalize physical schema.
2. Verify existing school/role authorization primitives.
3. Implement RLS or equivalent server-side tenant isolation.
4. Prove draft/preview/review records are not publicly readable.
5. Prove published reads cannot cross school boundaries.
6. Implement trusted hostname/custom-domain resolution.
7. Add abuse/rate-limit controls for public admission submission.
8. Add two-school runtime isolation tests.
9. Run dependency/security checks and repository tests.
10. Verify CI Green.
11. Obtain explicit production migration approval.

No production migration is authorized by this contract alone.
