-- DESIGN ONLY — NOT APPLIED TO Supabase Production.
-- Public website admission boundary. Do not merge into production migration history
-- until sandbox/RLS/runtime/security gates are complete.

create table if not exists public.website_admission_applications (
  application_id uuid primary key default gen_random_uuid(),
  school_id text not null,
  status text not null default 'pending'
    check (status in ('pending','reviewing','accepted','rejected','withdrawn')),
  student_name text not null check (char_length(trim(student_name)) between 1 and 160),
  date_of_birth date,
  applying_grade text not null check (char_length(trim(applying_grade)) between 1 and 80),
  guardian_name text not null check (char_length(trim(guardian_name)) between 1 and 160),
  guardian_phone text not null check (char_length(trim(guardian_phone)) between 3 and 40),
  guardian_email text,
  previous_school text,
  preferred_contact text not null default 'phone'
    check (preferred_contact in ('phone','email')),
  message text check (message is null or char_length(message) <= 4000),
  source_host text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_admission_school_status_idx
  on public.website_admission_applications (school_id, status, created_at desc);

alter table public.website_admission_applications enable row level security;

-- Deliberately NO anon SELECT/UPDATE/DELETE policy.
-- Public INSERT must eventually be mediated by a hardened server endpoint:
-- 1) resolve school_id from trusted hostname/site mapping
-- 2) validate and rate-limit input
-- 3) prevent replay/abuse
-- 4) insert with controlled server credentials
-- Staff review policies are added only after existing SCMS auth/role binding is verified.

-- IMPORTANT:
-- This table is an intake queue, NOT the Student Core.
-- Accepted applications require a separate authorized conversion workflow.
