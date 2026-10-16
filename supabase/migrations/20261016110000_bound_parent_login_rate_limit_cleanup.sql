-- Bound opportunistic cleanup work in the Parent Portal rate limiter.
-- The previous function deleted every expired key on every request. With a
-- large stale backlog that could turn a login request into an unbounded write.
-- Clean at most 1000 indexed rows per invocation; repeated requests drain the
-- backlog gradually without changing rate-limit decisions.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_parent_login_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_attempts integer;
  v_window_started_at timestamptz;
  v_retry_after integer;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$'
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
     OR p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 1000 THEN
    RAISE EXCEPTION 'invalid rate-limit parameters' USING ERRCODE = '22023';
  END IF;

  -- Use the updated_at index and cap cleanup to bound per-request write work.
  WITH stale_keys AS (
    SELECT key_hash
      FROM private.parent_login_rate_limits
     WHERE updated_at < now() - interval '24 hours'
     ORDER BY updated_at
     LIMIT 1000
  )
  DELETE FROM private.parent_login_rate_limits AS limits
   USING stale_keys
   WHERE limits.key_hash = stale_keys.key_hash;

  INSERT INTO private.parent_login_rate_limits AS current_limit
    (key_hash, window_started_at, attempts, updated_at)
  VALUES (p_key_hash, now(), 1, now())
  ON CONFLICT (key_hash) DO UPDATE
    SET window_started_at = CASE
          WHEN current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN now()
          ELSE current_limit.window_started_at
        END,
        attempts = CASE
          WHEN current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN 1
          ELSE current_limit.attempts + 1
        END,
        updated_at = now()
  RETURNING current_limit.attempts, current_limit.window_started_at
    INTO v_attempts, v_window_started_at;

  v_retry_after := GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (
      v_window_started_at + make_interval(secs => p_window_seconds) - now()
    )))::integer
  );

  RETURN jsonb_build_object(
    'allowed', v_attempts <= p_max_attempts,
    'attempts', v_attempts,
    'retry_after_seconds', v_retry_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_parent_login_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_parent_login_rate_limit(text, integer, integer)
  TO service_role;

COMMIT;
