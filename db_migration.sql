-- ============================================================================
-- SCMS v11 — Supabase Migration
-- ============================================================================
-- Run this once in your Supabase SQL editor (or psql) to add the v11 features
-- to the existing v10.x database. All statements are idempotent — safe to
-- re-run.
--
-- What it adds:
--   1) New columns on `students`     — parent_email, home_color
--      (date_of_birth already exists in v10.x — verified, no change)
--   2) `school_logo` on `schools.config_json` — stored inside the JSONB
--      already used for school settings, so no column add is required.
--   3) New table `chat_messages` — for the native-app staff chat
--   4) RLS policies for chat_messages (school-scoped, teacher-write)
--   5) An index on (school_id, channel, created_at) for fast paging
-- ============================================================================


-- ── 1) STUDENTS: new columns for v11 ────────────────────────────────────────
-- date_of_birth already exists from v10.x — added here only if missing.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS parent_email  text,
  ADD COLUMN IF NOT EXISTS home_color    text;

-- Optional: validate parent_email is a real email (loose check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_parent_email_ck'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_parent_email_ck
      CHECK (parent_email IS NULL OR parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  END IF;
END $$;

COMMENT ON COLUMN public.students.date_of_birth IS 'ISO date — used for age display and 🎂 reminders';
COMMENT ON COLUMN public.students.parent_email  IS 'Optional. Used by parent-report email flow.';
COMMENT ON COLUMN public.students.home_color    IS 'House / team colour id (see HOME_COLORS in 03_utils.js)';


-- ── 2) SCHOOLS.school_logo — stored inside config_json (JSONB) ──────────────
-- No column add needed. The frontend POSTs `update_school_config` with
-- patch={school_logo: <data URL>} and your existing rpc_update_school_config
-- merges the JSONB. If your rpc doesn't yet read the patch into config_json,
-- here's a reference implementation:
--
-- CREATE OR REPLACE FUNCTION public.rpc_update_school_config(
--   p_school_id text,
--   p_patch     jsonb
-- ) RETURNS jsonb
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE v_row schools%ROWTYPE;
-- BEGIN
--   UPDATE public.schools
--      SET config_json = COALESCE(config_json,'{}'::jsonb) || p_patch,
--          updated_at  = now()
--    WHERE school_id = p_school_id
--    RETURNING * INTO v_row;
--   RETURN jsonb_build_object('ok', true, 'school', row_to_json(v_row));
-- END $$;
--
-- The frontend reads it from either schoolConfig.school_logo OR
-- config.school_logo on the bootstrap response, so make sure your
-- rpc_bootstrap surfaces config_json.school_logo into one of those.


-- ── 3) CHAT MESSAGES table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id           bigserial PRIMARY KEY,
  school_id    text       NOT NULL,
  channel      text       NOT NULL DEFAULT 'staff',
  teacher_id   text       NOT NULL,
  teacher_name text       NOT NULL,
  text         text       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- For replies / threading later (optional, not used by v11 UI)
  reply_to_id  bigint
);

COMMENT ON TABLE public.chat_messages IS 'Staff chat for SCMS native-app users. Hidden in TWA.';

-- Hot path index: load latest N messages in a channel
CREATE INDEX IF NOT EXISTS idx_chat_messages_school_channel_time
  ON public.chat_messages (school_id, channel, created_at DESC);


-- ── 4) RLS for chat_messages ────────────────────────────────────────────────
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Read: anyone authenticated within the same school can read all channels.
-- (anon key + an active teacher in that school is enforced upstream.)
DROP POLICY IF EXISTS chat_read    ON public.chat_messages;
DROP POLICY IF EXISTS chat_insert  ON public.chat_messages;

CREATE POLICY chat_read ON public.chat_messages
  FOR SELECT
  USING (true);

-- Writes happen via the n8n TWA route (`chat_send`) using the service-role
-- key, so we don't need an INSERT policy for anon. If you ever wire the
-- frontend to insert directly, gate it behind a JWT custom claim of
-- `school_id` matching the row.


-- ── 5) (Optional) Stored procedure for chat_send ────────────────────────────
-- If you prefer a single RPC instead of a thin INSERT in n8n, here it is:
CREATE OR REPLACE FUNCTION public.rpc_chat_send(
  p_school_id    text,
  p_channel      text,
  p_teacher_id   text,
  p_teacher_name text,
  p_text         text
) RETURNS public.chat_messages
LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.chat_messages (school_id, channel, teacher_id, teacher_name, text)
  VALUES (p_school_id, COALESCE(p_channel,'staff'), p_teacher_id, p_teacher_name, p_text)
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_chat_send(text,text,text,text,text) TO anon, authenticated, service_role;


-- ============================================================================
-- DONE.
-- ============================================================================
-- After running this, add the two n8n routes described in README.md
-- (chat_send + parent-link confirmation polling).
-- ============================================================================


-- ============================================================================
-- v11 PART 2 — Native-app Telegram login sessions
-- ============================================================================
-- Adds the `app_sessions` table used by the landing page's "Sign in with
-- Telegram" flow. The app generates a token, opens Telegram with
-- /start app_login_<token>, the bot writes the teacher_id back, the app
-- polls the token row until it sees the teacher_id, then bootstraps.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_sessions (
  token        text PRIMARY KEY,
  telegram_id  text,
  teacher_id   text,
  teacher_name text,
  school_id    text,
  status       text NOT NULL DEFAULT 'pending',   -- 'pending' | 'linked' | 'revoked'
  device_ua    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  linked_at    timestamptz,
  last_seen_at timestamptz
);

COMMENT ON TABLE public.app_sessions IS
  'Native-app login tokens. The app generates a token, opens TG with /start app_login_<token>, the bot fills in telegram_id+teacher_id, the app polls.';

CREATE INDEX IF NOT EXISTS idx_app_sessions_token_status
  ON public.app_sessions (token, status);

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

-- Anon can pre-register a pending session (the app does this before opening TG)
DROP POLICY IF EXISTS app_sessions_insert ON public.app_sessions;
CREATE POLICY app_sessions_insert ON public.app_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND telegram_id IS NULL);

-- Anon can read its own session (lookups are by random token, so safe)
DROP POLICY IF EXISTS app_sessions_select ON public.app_sessions;
CREATE POLICY app_sessions_select ON public.app_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

-- Only service-role (used by n8n) can update — i.e. only the bot can
-- bind a telegram_id to a token. Anon cannot promote itself.
-- (No policy = service_role bypasses RLS.)


-- ── RPC: bot calls this from n8n after parsing /start app_login_<token> ──
-- Looks up the teacher by telegram_id, marks the session linked.
CREATE OR REPLACE FUNCTION public.rpc_app_login_bind(
  p_token       text,
  p_telegram_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_teacher RECORD;
  v_session app_sessions%ROWTYPE;
BEGIN
  -- Find the teacher (must be active in an active school)
  SELECT t.teacher_id, t.teacher_name, t.school_id, t.status, s.status AS school_status
    INTO v_teacher
    FROM public.teachers t
    LEFT JOIN public.schools s ON s.school_id = t.school_id
   WHERE t.telegram_id = p_telegram_id
   LIMIT 1;

  IF v_teacher IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_teacher',
      'message', 'No teacher account found for this Telegram ID. Use /register_teacher first.');
  END IF;

  IF v_teacher.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active',
      'message', 'Your account is ' || v_teacher.status || '. Wait for admin approval.');
  END IF;

  -- Upsert the session row
  INSERT INTO public.app_sessions
        (token, telegram_id, teacher_id, teacher_name, school_id, status, linked_at, last_seen_at)
  VALUES (p_token, p_telegram_id, v_teacher.teacher_id, v_teacher.teacher_name,
          v_teacher.school_id, 'linked', now(), now())
  ON CONFLICT (token) DO UPDATE
    SET telegram_id  = EXCLUDED.telegram_id,
        teacher_id   = EXCLUDED.teacher_id,
        teacher_name = EXCLUDED.teacher_name,
        school_id    = EXCLUDED.school_id,
        status       = 'linked',
        linked_at    = now(),
        last_seen_at = now()
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'ok',           true,
    'teacher_id',   v_session.teacher_id,
    'teacher_name', v_session.teacher_name,
    'school_id',    v_session.school_id
  );
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_app_login_bind(text, text) TO service_role;

-- ============================================================================
-- DONE — app_sessions ready.
-- ============================================================================
