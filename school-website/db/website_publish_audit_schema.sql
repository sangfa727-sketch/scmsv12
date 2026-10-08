-- DESIGN ONLY — NOT APPLIED TO Supabase Production.
-- Publication audit boundary. Production migration requires separate approval.

create table if not exists public.website_publish_audit (
  audit_id uuid primary key default gen_random_uuid(),
  school_id text not null,
  draft_id uuid not null,
  actor_id text not null,
  action text not null check (action in ('submit_review','publish')),
  from_status text not null,
  to_status text not null,
  created_at timestamptz not null default now()
);

alter table public.website_publish_audit enable row level security;

-- No public/anon access is granted.
-- Production write policy must bind to the existing authenticated SCMS
-- Website Publisher role. Public visitors must never read this audit table.
