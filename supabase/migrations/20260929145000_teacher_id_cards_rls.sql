-- Protect teacher ID card secrets from direct PostgREST access.
alter table public.teacher_id_cards enable row level security;
revoke all on table public.teacher_id_cards from anon, authenticated;
grant usage on schema public to anon, authenticated;
