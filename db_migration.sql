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

-- ============================================================================
-- v12 SECURITY — Exact-token Telegram app-session polling
-- ============================================================================
-- Do not expose app_sessions rows through PostgREST SELECT. The frontend polls
-- only its own random token through this narrow RPC instead.
CREATE OR REPLACE FUNCTION public.rpc_app_session_poll(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT token, telegram_id, teacher_id, teacher_name, school_id, status
    INTO v_row
    FROM public.app_sessions
   WHERE token = p_token
     AND status = 'linked'
   LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'linked', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'session', jsonb_build_object(
      'token', v_row.token,
      'telegram_id', v_row.telegram_id,
      'teacher_id', v_row.teacher_id,
      'teacher_name', v_row.teacher_name,
      'school_id', v_row.school_id,
      'status', v_row.status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_app_session_poll(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_app_session_poll(text) TO anon, authenticated;

DROP POLICY IF EXISTS app_sessions_select ON public.app_sessions;
-- ============================================================================
-- v12 SECURITY — Chat control boundary
-- ============================================================================
-- v12 frontend chat uses session-bound RPCs, not direct table access.
DROP POLICY IF EXISTS chat_read ON public.chat_messages;
DROP POLICY IF EXISTS chat_insert ON public.chat_messages;

REVOKE ALL ON FUNCTION public.rpc_chat_send(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_chat_send(text,text,text,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_chat_send(text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_chat_send(
  p_school_id text,
  p_channel text,
  p_teacher_id text,
  p_teacher_name text,
  p_text text
) RETURNS public.chat_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.chat_messages (school_id, channel, teacher_id, teacher_name, text)
  VALUES (p_school_id, COALESCE(p_channel,'staff'), p_teacher_id, p_teacher_name, p_text)
  RETURNING *;
$$;



-- v12 Student management: admin-only soft deactivation
-- The UI calls this instead of PATCHing students directly. The RPC derives
-- school + teacher identity from the web session and records an audit event.
CREATE OR REPLACE FUNCTION public.rpc_deactivate_student(
  p_session_token text,
  p_student_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  v_sess record;
  v_row record;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF COALESCE(v_sess.role, '') NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden',
      'message', 'Only an administrator can deactivate a student.');
  END IF;

  IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  UPDATE public.students
     SET status = 'Inactive',
         updated_at = now()
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id
     AND status = 'Active'
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_active');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web',
    v_sess.teacher_id,
    'student.deactivate',
    v_sess.school_id,
    jsonb_build_object('student_id', p_student_id)
  );

  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$;

REVOKE ALL ON FUNCTION public.rpc_deactivate_student(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_deactivate_student(text,text) TO anon, authenticated;


-- v12 Parent Portal communication + schedule expansion
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone;

CREATE TABLE IF NOT EXISTS public.parent_portal_events (
  id bigint generated by default as identity primary key,
  school_id text not null,
  class text,
  student_id text,
  event_type text not null default 'announcement',
  title text not null,
  description text,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone,
  is_published boolean not null default true,
  created_by text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

ALTER TABLE public.parent_portal_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_parent_portal_events_school_start
  ON public.parent_portal_events (school_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_parent_portal_events_school_class_start
  ON public.parent_portal_events (school_id, class, starts_at);

CREATE INDEX IF NOT EXISTS idx_parent_portal_events_student_start
  ON public.parent_portal_events (school_id, student_id, starts_at);

-- Parent Portal dashboard now returns scoped school messages, class timetable,
-- upcoming assessment times, and published school/parent events.


-- v12 Student lifecycle: admin-only reactivation
CREATE OR REPLACE FUNCTION public.rpc_reactivate_student(p_session_token text,p_student_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sess record; v_row record;
BEGIN
 SELECT s.teacher_id,s.school_id,s.role INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
 IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF COALESCE(v_sess.role,'') NOT IN ('admin','super_admin') THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
 UPDATE public.students SET status='Active',updated_at=now() WHERE student_id=p_student_id AND school_id=v_sess.school_id AND status='Inactive' RETURNING * INTO v_row;
 IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found_or_not_inactive'); END IF;
 INSERT INTO public.audit_log(source,actor,action,school_id,payload) VALUES('web',v_sess.teacher_id,'student.reactivate',v_sess.school_id,jsonb_build_object('student_id',p_student_id));
 RETURN jsonb_build_object('ok',true,'student',to_jsonb(v_row));
END $$;
REVOKE ALL ON FUNCTION public.rpc_reactivate_student(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_reactivate_student(text,text) TO anon,authenticated;


-- ============================================================================
-- SCMS v12 — Student Management hardening / history
-- ============================================================================
-- Keep student SECURITY DEFINER RPCs on a fixed search_path and write lifecycle
-- audit entries. History is returned only for a student inside the caller's
-- validated school scope.
CREATE OR REPLACE FUNCTION public.rpc_register_student(
  p_session_token text,
  p_name_local text DEFAULT NULL,
  p_name_en text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_home_color text DEFAULT NULL,
  p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL,
  p_parent_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE v_sess record; v_existing record; v_id text; v_row record;
BEGIN
  SELECT s.teacher_id,s.school_id,s.role INTO v_sess
  FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_name_en IS NULL OR trim(p_name_en)='' THEN RETURN jsonb_build_object('ok',false,'error','name_en_required'); END IF;
  IF p_class IS NULL OR trim(p_class)='' THEN RETURN jsonb_build_object('ok',false,'error','class_required'); END IF;
  SELECT student_id,name_en,class,grade INTO v_existing FROM public.students
  WHERE school_id=v_sess.school_id AND status='Active'
    AND lower(trim(class))=lower(trim(p_class)) AND lower(trim(name_en))=lower(trim(p_name_en)) LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'duplicate',true,'existing_student_id',v_existing.student_id,
      'message','A student named "'||v_existing.name_en||'" already exists in class '||v_existing.class||'. Edit that record instead of creating a new one.');
  END IF;
  v_id := 'STU-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||substr(md5(random()::text),1,4);
  INSERT INTO public.students(student_id,school_id,name_local,name_mm,name_en,class,grade,gender,date_of_birth,dob,home_color,house_color,house,parent_name,parent_phone,parent_email,status,enrollment_date)
  VALUES(v_id,v_sess.school_id,nullif(trim(p_name_local),''),coalesce(nullif(trim(p_name_local),''),p_name_en),trim(p_name_en),trim(p_class),p_grade,p_gender,p_date_of_birth,p_date_of_birth,p_home_color,p_home_color,p_home_color,nullif(trim(p_parent_name),''),nullif(trim(p_parent_phone),''),nullif(trim(p_parent_email),''),'Active',current_date)
  RETURNING * INTO v_row;
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES('web',v_sess.teacher_id,'student.create',v_sess.school_id,jsonb_build_object('student_id',v_id,'name_en',v_row.name_en,'class',v_row.class,'grade',v_row.grade));
  RETURN jsonb_build_object('ok',true,'student',to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_student(
  p_session_token text,p_student_id text,p_name_local text,p_name_en text,p_class text,p_grade text,p_gender text,
  p_date_of_birth date,p_home_color text,p_parent_name text,p_parent_phone text,p_parent_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE v_sess record; v_row record;
BEGIN
  SELECT s.teacher_id,s.school_id INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_student_id IS NULL OR trim(p_student_id)='' THEN RETURN jsonb_build_object('ok',false,'error','student_id_required'); END IF;
  IF p_name_en IS NULL OR trim(p_name_en)='' THEN RETURN jsonb_build_object('ok',false,'error','name_en_required'); END IF;
  IF p_class IS NULL OR trim(p_class)='' THEN RETURN jsonb_build_object('ok',false,'error','class_required'); END IF;
  UPDATE public.students SET name_local=nullif(trim(coalesce(p_name_local,'')),''),name_mm=coalesce(nullif(trim(coalesce(p_name_local,'')),''),p_name_en),
    name_en=trim(p_name_en),class=trim(p_class),grade=p_grade,gender=p_gender,date_of_birth=p_date_of_birth,dob=p_date_of_birth,
    home_color=p_home_color,house_color=p_home_color,house=p_home_color,parent_name=nullif(trim(coalesce(p_parent_name,'')),''),
    parent_phone=nullif(trim(coalesce(p_parent_phone,'')),''),parent_email=nullif(trim(coalesce(p_parent_email,'')) ,''),updated_at=now()
  WHERE student_id=p_student_id AND school_id=v_sess.school_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES('web',v_sess.teacher_id,'student.update',v_sess.school_id,jsonb_build_object('student_id',v_row.student_id,'name_en',v_row.name_en,'class',v_row.class,'grade',v_row.grade,'parent_name',v_row.parent_name,'parent_phone',v_row.parent_phone,'parent_email',v_row.parent_email));
  RETURN jsonb_build_object('ok',true,'student',to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_student_history(p_session_token text,p_student_id text,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, extensions
AS $function$
DECLARE v_sess record; v_exists boolean; v_limit integer;
BEGIN
  SELECT s.teacher_id,s.school_id,s.role INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_student_id IS NULL OR trim(p_student_id)='' THEN RETURN jsonb_build_object('ok',false,'error','student_id_required'); END IF;
  SELECT EXISTS(SELECT 1 FROM public.students WHERE student_id=p_student_id AND school_id=v_sess.school_id) INTO v_exists;
  IF NOT v_exists THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  v_limit:=LEAST(GREATEST(COALESCE(p_limit,50),1),100);
  RETURN jsonb_build_object('ok',true,'history',COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.ts DESC) FROM (
      SELECT id,ts,source,actor,action,payload FROM public.audit_log
      WHERE school_id=v_sess.school_id AND payload->>'student_id'=p_student_id
      ORDER BY ts DESC LIMIT v_limit
    ) x
  ),'[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_register_student(text,text,text,text,text,text,date,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_register_student(text,text,text,text,text,text,date,text,text,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_update_student(text,text,text,text,text,text,text,date,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_update_student(text,text,text,text,text,text,text,date,text,text,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_get_student_history(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_student_history(text,text,integer) TO anon,authenticated;
