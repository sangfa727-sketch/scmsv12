-- SCMS v12 — School Website management permission.
-- Design/release artifact only: do not apply to production without explicit approval.
-- School owners/admins receive the permission by role; delegated staff can receive a
-- global teacher_permissions override through rpc_manage_teacher_access.
-- Public website access remains separate from private SCMS data permissions.

insert into public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active, display_order)
values
  ('website.manage', 'school_website', 'Manage the school public website content and draft', 'global', true, true, 90)
on conflict (permission_key) do update set
  category = excluded.category,
  description = excluded.description,
  scope_type = excluded.scope_type,
  is_sensitive = excluded.is_sensitive,
  is_active = true,
  display_order = excluded.display_order;

-- Explicit default grants for supported owner/admin role names. Do not grant all roles.
insert into public.role_permissions (role, permission_key, allowed)
values ('owner', 'website.manage', true),
       ('school_owner', 'website.manage', true),
       ('admin', 'website.manage', true),
       ('super_admin', 'website.manage', true)
-- Preserve any explicit role-level deny if this migration is reapplied.
on conflict (role, permission_key) do nothing;
