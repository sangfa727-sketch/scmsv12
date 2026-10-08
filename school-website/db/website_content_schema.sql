-- DESIGN ONLY — NOT APPLIED TO Supabase Production.
-- Public website content boundary. Production migration requires separate approval.

create table if not exists public.website_sites (
  site_key text primary key check (site_key ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  school_id text not null,
  hostname text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_pages (
  page_id uuid primary key default gen_random_uuid(),
  school_id text not null,
  slug text not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null default '',
  publication_status text not null default 'draft'
    check (publication_status in ('draft','preview','review','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, slug)
);

create index if not exists website_pages_public_idx
  on public.website_pages (school_id, slug)
  where publication_status = 'published';

alter table public.website_sites enable row level security;
alter table public.website_pages enable row level security;

-- Public access is intentionally not granted here.
-- A hardened server endpoint should:
--   1) resolve school_id from trusted hostname/custom-domain mapping,
--   2) query only the requested school's published rows,
--   3) never accept publication_status from the public client as an authorization control.
-- Staff authoring/publish policies must be bound to existing SCMS roles before production.
-- Do not expose draft/review rows through anon SELECT.
