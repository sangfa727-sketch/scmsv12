# School Website publishing and public-rendering gates

This is an implementation checklist, not a production deployment instruction. The migrations in this feature branch must be tested in a disposable database first and must not be applied to the SCMS production database without a separate explicit approval.

## Publishing lifecycle

1. A user with `website.manage` edits a private, school-scoped draft.
2. Drafts are normalized server-side and saved with optimistic versioning.
3. An editor submits the current draft version for review.
4. A user with the separate sensitive `website.publish` permission publishes the reviewed version.
5. The publish RPC atomically snapshots the reviewed content into `website_publications` and records an audit event.
6. Public reads use `rpc_school_website_get_published(hostname)`. It returns a publication only when the exact hostname is registered and active in `website_sites`. Drafts and school identifiers are never returned by this public RPC.

## Deployment gates still required

- Configure the actual public website hosting origin and public Supabase anon key in the two empty meta tags in `school-website/index.html`. The anon key is public; **never place a service-role key in HTML or browser JavaScript**.
- Configure the HTTPS Supabase project origin in the empty `scms-public-website-api-base` meta tag in `school-website/admission.html`.
- Provision and verify each hostname in the private `website_sites` registry. Keep `active = false` until DNS/hosting routes to the correct site and the public page configuration has been checked.
- Confirm the public host can reach the Supabase REST RPC endpoint over HTTPS, and test active-host lookup, inactive-host denial, unknown-host denial, and school isolation in a disposable environment.
- Configure the server-only `SCMS_ADMISSION_RATE_LIMIT_SALT` for the admission Edge Function. The service-role key must remain in Edge Function secrets.
- Test with separate owner/admin, content-only manager, and other-school accounts. A content-only manager must not be able to publish or review admission PII.
- Verify backups, retention, privacy notices/consent wording, and the school’s operational process for handling submitted applications before opening the form publicly.

## Current scope boundaries

- Publishing does not create or update Student Core rows.
- Public rendering uses published snapshots only; editing a draft does not change the live site until review and publication complete.
- This feature does not provision DNS, hostnames, custom domains, or SSL certificates. Those remain a separate setup workflow.
