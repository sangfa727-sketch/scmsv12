-- Keep the QR challenge school_id type aligned with the production teachers/teacher_id_cards schema.
-- Production school identifiers are text values such as SCH-0001, not UUIDs.
-- The challenge table is internal and currently empty, so this is a safe type correction.
alter table public.teacher_card_login_challenges
  alter column school_id type text
  using school_id::text;
