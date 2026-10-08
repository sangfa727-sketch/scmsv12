# SCMS v12 — Public School Website Foundation

This workstream is intentionally isolated from the SCMS private management core.

## Boundary

- Public website reads **published public content only**.
- No student, parent, teacher-private, attendance, academic, health, billing, transport, library, or staff-chat data is exposed here.
- No Supabase production schema or production data is changed by this foundation.
- School resolution is based on the request hostname (for example `school-a.scmsv12.com`).
- Custom domains can be added later without changing the public-content contract.

## Planned flow

```
SCMS Admin
  -> Website Content (draft)
  -> Preview
  -> Publish
  -> Published Public Content
  -> School subdomain
```

## First implementation gate

Before connecting a production data source:

1. Define the public-content schema.
2. Enforce school/tenant isolation server-side.
3. Expose only published records.
4. Add RLS/security-contract tests.
5. Add preview/publish authorization.
6. Verify custom/subdomain routing.
7. CI Green.
8. Runtime two-school isolation test.
9. Explicit production migration approval.

This branch does not modify the Production Core.
