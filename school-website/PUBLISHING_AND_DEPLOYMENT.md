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

- The platform operator must first verify wildcard DNS, hosting routing, and TLS for the actual root domain, then configure that domain in the private `website_platform_domains` registry as the single active default. This migration intentionally inserts no domain and does not assume a domain name.
- Example only, after replacing the placeholder with a verified root domain and reviewing the SQL: `insert into public.website_platform_domains(base_domain, active, is_default, verified_at) values ('YOUR-VERIFIED-ROOT-DOMAIN', true, true, now());`
- A school owner/authorized website manager can then reserve a subdomain from the Website Studio dialog. Reservation creates an inactive site record; it does not expose public content.
- After at least one publication exists and the platform domain is verified, a user with `website.publish` can activate the reserved site. Activation is denied when no publication exists or the platform domain is not verified.
- Configure the actual public website hosting origin and public Supabase anon key in the two empty meta tags in `school-website/index.html`. The anon key is public; **never place a service-role key in HTML or browser JavaScript**.
- Configure the HTTPS Supabase project origin in the empty `scms-public-website-api-base` meta tag in `school-website/admission.html`.
- Confirm the public host can reach the Supabase REST RPC endpoint over HTTPS, and test active-host lookup, inactive-host denial, unknown-host denial, and school isolation in a disposable environment.
- Configure the server-only `SCMS_ADMISSION_RATE_LIMIT_SALT` for the admission Edge Function. The service-role key must remain in Edge Function secrets.
- Test with separate owner/admin, content-only manager, and other-school accounts. A content-only manager must not be able to publish or review admission PII.
- Verify backups, retention, privacy notices/consent wording, and the school’s operational process for handling submitted applications before opening the form publicly.

## Current scope boundaries

- Publishing does not create or update Student Core rows.
- Public rendering uses published snapshots only; editing a draft does not change the live site until review and publication complete.
- This feature reserves platform subdomains after the platform root domain is configured, but it does not provision DNS records, wildcard routing, custom domains, or SSL certificates. Those remain platform-operator responsibilities.
