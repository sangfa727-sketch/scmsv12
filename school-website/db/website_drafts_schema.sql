-- DESIGN ONLY — NOT APPLIED TO Supabase Production.
-- Persistent Website Studio draft boundary. Production migration requires separate approval.

create table if not exists public.website_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  school_id text not null,
  template_key text not null check (template_key in ('modern','classic','premium')),
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft','review')),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists website_drafts_school_active_idx
  on public.website_drafts (school_id)
  where status in ('draft','review');

alter table public.website_drafts enable row level security;

-- No public/anon access is granted.
-- Authoring endpoints MUST resolve school_id from the authenticated SCMS
-- workspace context, never from public website input.
-- Staff write/read policies must be bound to existing SCMS roles before
-- production migration. Review/publish remains a separate authorization gate.
