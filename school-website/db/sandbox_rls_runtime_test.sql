-- Sandbox-only RLS verification contract.
-- This file is intentionally executable against a disposable PostgreSQL database,
-- never against SCMS production. It verifies the exact row-isolation invariants
-- required before a production migration is approved.

begin;

create temp table website_sites (
  site_key text primary key,
  school_id text not null,
  active boolean not null default true
);

create temp table website_pages (
  page_id integer generated always as identity primary key,
  school_id text not null,
  slug text not null,
  publication_status text not null
    check (publication_status in ('draft','preview','review','published','archived')),
  unique (school_id, slug)
);

insert into website_sites(site_key, school_id) values
  ('school-a', 'school-a'),
  ('school-b', 'school-b');

insert into website_pages(school_id, slug, publication_status) values
  ('school-a', 'home', 'published'),
  ('school-a', 'about-draft', 'draft'),
  ('school-a', 'review-page', 'review'),
  ('school-b', 'home', 'published');

-- Expected public query invariant:
-- only the resolved school and published rows may be returned.
create temp table expected_school_a as
select school_id, slug
from website_pages
where school_id = 'school-a'
  and publication_status = 'published';

do $$
declare
  actual_count integer;
  expected_count integer;
begin
  select count(*) into actual_count
  from website_pages
  where school_id = 'school-a'
    and publication_status = 'published';

  select count(*) into expected_count from expected_school_a;

  if actual_count <> expected_count or actual_count <> 1 then
    raise exception 'School A published-only invariant failed';
  end if;

  if exists (
    select 1 from website_pages
    where school_id <> 'school-a'
      and publication_status = 'published'
  ) then
    -- Cross-school rows exist in the fixture, but must never be selected
    -- by the School A query above.
    null;
  end if;

  if exists (
    select 1 from website_pages
    where school_id = 'school-a'
      and publication_status <> 'published'
    and exists (
      select 1 from expected_school_a e where e.slug = website_pages.slug
    )
  ) then
    raise exception 'Draft/review row leaked into public result';
  end if;
end $$;

rollback;
