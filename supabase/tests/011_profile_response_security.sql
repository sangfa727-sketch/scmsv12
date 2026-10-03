DO $$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_def
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='rpc_upsert_health_profile' LIMIT 1;
 IF v_def IS NULL THEN RAISE EXCEPTION 'function missing'; END IF;
 IF v_def NOT ILIKE '%SECURITY DEFINER%' THEN RAISE EXCEPTION 'security definer missing'; END IF;
 IF v_def ILIKE '%to_jsonb(v_row)%' OR v_def ILIKE '%row_to_json(v_row)%' THEN RAISE EXCEPTION 'whole row response remains'; END IF;
 IF v_def NOT ILIKE '%jsonb_build_object%' THEN RAISE EXCEPTION 'explicit response missing'; END IF;
END $$;
