-- Sandbox-only RLS verification contract.
-- Execute only against a disposable PostgreSQL database, never SCMS production.
-- This harness verifies actual PostgreSQL RLS behavior, tenant isolation, and
-- published-only visibility using a transaction that always rolls back.

begin;

create temp table website_pages (
  page_id integer generated always as identity primary key,
  school_id text not null,
  slug text not null,
  publication_status text not null
    check (publication_status in ('draft','preview','review','published','archived')),
  unique (school_id, slug)
);

insert into website_pages(school_id, slug, publication_status) values
  ('school-a', 'home', 'published'),
  ('school-a', 'about-draft', 'draft'),
  ('school-a', 'review-page', 'review'),
  ('school-b', 'home', 'published');

alter table website_pages enable row level security;
alter table website_pages force row level security;

-- RLS is bypassed by table owners/superusers, so execute the read assertions as a separate non-owner role.
create role website_public_test;
grant select on website_pages to website_public_test;
set role website_public_test;

create policy public_published_same_school
on website_pages
for select
using (
  school_id = current_setting('app.school_id', true)
  and publication_status = 'published'
);

do $$
declare
  actual_count integer;
begin
  perform set_config('app.school_id', 'school-a', true);

  select count(*) into actual_count
  from website_pages;

  if actual_count <> 1 then
    raise exception 'School A public RLS expected 1 row, got %', actual_count;
  end if;

  if exists (
    select 1 from website_pages
    where school_id <> 'school-a'
  ) then
    raise exception 'Cross-school row leaked through RLS';
  end if;

  if exists (
    select 1 from website_pages
    where publication_status <> 'published'
  ) then
    raise exception 'Draft/review row leaked through RLS';
  end if;

  perform set_config('app.school_id', 'school-b', true);

  select count(*) into actual_count
  from website_pages;

  if actual_count <> 1 then
    raise exception 'School B public RLS expected 1 row, got %', actual_count;
  end if;

  if exists (
    select 1 from website_pages
    where school_id <> 'school-b'
  ) then
    raise exception 'School A row leaked into School B result';
  end if;
end $;

reset role;
rollback;
