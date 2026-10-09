# Initial Developer Control Center Operator

## Requested initial operator

- Email: `staillasbi@gmail.com`
- Intended role: `platform_owner` (initial Developer Control Center administrator)
- Provisioning status: **NOT CREATED / NOT GRANTED**
- Password: **Never store in this repository, migrations, issues, logs, or source control.**

This file records the requested identity only. It does not create an authentication user, grant privileges, or prove ownership of the email address.

## Required safe provisioning sequence

1. Confirm control of the email address using a Supabase Auth invitation or verified password-reset flow. Do not create an operator based only on a typed email address.
2. Use the supported Supabase Auth Admin API from a trusted server-side environment; never from browser code and never by manually writing to `auth.users`.
3. Have the operator establish a unique, strong password through the provider's secure flow. Require MFA before enabling platform-owner privileges. The user-supplied sample password is not persisted or adopted by this change.
4. Store authorization in a server-controlled source (e.g. protected app metadata or a dedicated private operator registry) and enforce it on every privileged server endpoint. Never trust localStorage, URL flags, user-editable metadata, or frontend-only route guards.
5. Ensure there is no public Developer sign-up path. Add session expiry/revocation, least privilege, and immutable audit events for privileged actions.
6. Test negative access cases (anonymous, parent, teacher, school admin, and an ordinary authenticated user) before enabling the console.
7. Do not alter existing school login/bootstrap RPC grants or the Production Core as part of operator provisioning without function-by-function evidence and regression tests.

## Current gate

The Developer Control Center identity boundary and supported server-side provisioning path have not yet been proven. Therefore no production user, role, password, or privileged grant has been changed. Keep the console unavailable until the above checks are complete.
