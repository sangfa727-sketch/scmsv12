-- Serialize redemption of a teacher invite so concurrent logins cannot consume it twice.
-- Reconstructed from the read-only Production definition; the behavioral change is FOR UPDATE.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_google_login(
  p_google_sub text,
  p_google_email text,
  p_device_ua text DEFAULT NULL::text,
  p_invite_code text DEFAULT NULL::text,
  p_new_school_name text DEFAULT NULL::text,
  p_teacher_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_teacher   RECORD;
  v_invite    RECORD;
  v_school_id text;
  v_token     text;
BEGIN
  IF p_google_sub IS NULL OR p_google_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_claims');
  END IF;

  -- 1) Already-linked Google account → straight login
  SELECT teacher_id, teacher_name, school_id, status, role, must_change_password
    INTO v_teacher
    FROM public.teachers
   WHERE google_sub = p_google_sub
   LIMIT 1;

  IF v_teacher IS NOT NULL THEN
    IF v_teacher.status <> 'active' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'inactive',
        'message', 'သင့် account က ' || v_teacher.status || ' ဖြစ်နေပါတယ်။ Admin ဆီ ဆက်သွယ်ပါ။');
    END IF;

    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, device_ua)
    VALUES (v_token, v_teacher.teacher_id, v_teacher.school_id, v_teacher.role, p_device_ua);

    UPDATE public.teachers SET last_web_login_at = now() WHERE teacher_id = v_teacher.teacher_id;

    RETURN jsonb_build_object(
      'ok', true, 'auth_mode', 'google', 'session_token', v_token,
      'teacher_id', v_teacher.teacher_id, 'teacher_name', v_teacher.teacher_name,
      'school_id', v_teacher.school_id, 'role', v_teacher.role,
      'must_change_password', v_teacher.must_change_password
    );
  END IF;

  -- 2) Not linked yet — redeem an invite code (join existing school).
  -- Lock the matching invite row until this transaction marks it redeemed.
  IF p_invite_code IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.teacher_invites
     WHERE invite_code = p_invite_code
       AND redeemed_at IS NULL
       AND expires_at > now()
     LIMIT 1
     FOR UPDATE;

    IF v_invite IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_invite',
        'message', 'Invite code မှားနေတယ် (သို့) သက်တမ်းကုန်သွားပါပြီ');
    END IF;

    -- Reject if this Google email is already a teacher some other way
    IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(email) = lower(p_google_email)
                 OR lower(google_email) = lower(p_google_email)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'email_in_use',
        'message', 'ဒီ email နဲ့ account ရှိနေပါပြီ');
    END IF;

    v_school_id := public._scms_new_teacher_id_for_invite(v_invite.school_id);

    INSERT INTO public.teachers
      (teacher_id, teacher_name, school_id, status, role, email,
       google_sub, google_email, google_linked_at)
    VALUES
      (v_school_id, COALESCE(p_teacher_name, v_invite.teacher_name, split_part(p_google_email,'@',1)),
       v_invite.school_id, 'active', v_invite.role, p_google_email,
       p_google_sub, p_google_email, now());

    UPDATE public.teacher_invites
       SET redeemed_at = now(), redeemed_by_teacher_id = v_school_id
     WHERE invite_code = p_invite_code;

    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, device_ua)
    VALUES (v_token, v_school_id, v_invite.school_id, v_invite.role, p_device_ua);

    RETURN jsonb_build_object(
      'ok', true, 'auth_mode', 'google', 'session_token', v_token,
      'teacher_id', v_school_id, 'teacher_name', COALESCE(p_teacher_name, v_invite.teacher_name),
      'school_id', v_invite.school_id, 'role', v_invite.role,
      'must_change_password', false,
      'message', 'Account ချိတ်ဆက်ပြီးပါပြီ'
    );
  END IF;

  -- 3) Not linked, no invite — offer to register a new school if requested
  IF p_new_school_name IS NOT NULL AND length(trim(p_new_school_name)) > 0 THEN
    SELECT public.rpc_generate_school_id() INTO v_school_id;

    INSERT INTO public.schools (school_id, school_name, status, school_email, created_at)
    VALUES (v_school_id, p_new_school_name, 'active', p_google_email, now());

    DECLARE
      v_new_teacher_id text := public._scms_new_teacher_id_for_invite(v_school_id);
    BEGIN
      INSERT INTO public.teachers
        (teacher_id, teacher_name, school_id, status, role, email,
         google_sub, google_email, google_linked_at)
      VALUES
        (v_new_teacher_id, COALESCE(p_teacher_name, split_part(p_google_email,'@',1)),
         v_school_id, 'active', 'admin', p_google_email,
         p_google_sub, p_google_email, now());

      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, device_ua)
      VALUES (v_token, v_new_teacher_id, v_school_id, 'admin', p_device_ua);

      RETURN jsonb_build_object(
        'ok', true, 'auth_mode', 'google', 'session_token', v_token,
        'teacher_id', v_new_teacher_id, 'teacher_name', COALESCE(p_teacher_name, split_part(p_google_email,'@',1)),
        'school_id', v_school_id, 'role', 'admin', 'must_change_password', false,
        'message', 'School အသစ် ဖန်တီးပြီး admin အဖြစ် စတင်ပါပြီ'
      );
    END;
  END IF;

  -- 4) No match, no invite, no new-school request → tell frontend what's needed
  RETURN jsonb_build_object(
    'ok', false, 'error', 'no_account',
    'message', 'ဒီ Google account နဲ့ account မရှိသေးပါ',
    'needs_choice', true
  );
END;
$function$;

COMMIT;
