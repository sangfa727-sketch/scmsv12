-- SCMS v12 School Website: establish the base Website Studio capability.
-- This must run before the School Website intake, review, draft, publish, and
-- subdomain migrations because their server-side RPCs require website.manage.
-- Grants only the existing school-management roles; teacher/staff roles remain denied.

insert into public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active, display_order)
values
  ('website.manage', 'school_website',
   'Manage the school public website content, drafts, and site settings',
   'global', true, true, 90)
on conflict (permission_key) do update set
  category = excluded.category,
  description = excluded.description,
  scope_type = excluded.scope_type,
  is_sensitive = true,
  is_active = true,
  display_order = excluded.display_order;

insert into public.role_permissions (role, permission_key, allowed)
values
  ('owner', 'website.manage', true),
  ('school_owner', 'website.manage', true),
  ('admin', 'website.manage', true),
  ('super_admin', 'website.manage', true)
on conflict (role, permission_key) do update
  set allowed = excluded.allowed;
