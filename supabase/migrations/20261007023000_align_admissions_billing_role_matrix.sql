-- SCMS v12 — teacher access / admissions / billing authorization audit
-- Align the role matrix with the existing financial mutation boundary:
-- billing mutations remain admin/super_admin only. Administrative assistants
-- may view billing, but must not be granted the billing.write capability.
--
-- The live billing write RPCs already enforce _billing_admin_session(),
-- which accepts only admin/super_admin. This migration removes the policy
-- mismatch so UI/effective-permission state matches actual backend access.

UPDATE public.role_permissions
SET allowed = false
WHERE role = 'administrative_assistant'
  AND permission_key = 'billing.write';

-- Keep billing.view available to administrative assistants for operational
-- visibility; do not change admissions.view/admissions.manage here.
