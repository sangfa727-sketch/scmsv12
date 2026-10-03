-- SCMS v12 AI confirmation persistence
CREATE TABLE IF NOT EXISTS public.ai_confirmation_pending (
  confirmation_id text PRIMARY KEY, session_id text NOT NULL, teacher_id text NOT NULL,
  school_id text NOT NULL, action_digest text NOT NULL, action text NOT NULL,
  resolved_rpc text NOT NULL, resolved_args jsonb NOT NULL, risk_class text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  consumed_at timestamptz, cancelled_at timestamptz,
  CONSTRAINT ai_confirmation_pending_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT ai_confirmation_pending_terminal_ck CHECK (NOT (consumed_at IS NOT NULL AND cancelled_at IS NOT NULL))
);
ALTER TABLE public.ai_confirmation_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_confirmation_pending FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_ai_confirmation_pending_session ON public.ai_confirmation_pending(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_confirmation_pending_digest ON public.ai_confirmation_pending(action_digest);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_confirmation_pending_active_session ON public.ai_confirmation_pending(session_id) WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE OR REPLACE FUNCTION public.rpc_ai_confirmation_create(
 p_session_token text,p_confirmation_id text,p_action_digest text,p_action text,p_resolved_rpc text,
 p_resolved_args jsonb,p_risk_class text,p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $function$
DECLARE v_sess record; v_session_id text;
BEGIN
 IF NULLIF(trim(p_session_token),'') IS NULL OR NULLIF(trim(p_confirmation_id),'') IS NULL
 OR NULLIF(trim(p_action_digest),'') IS NULL OR NULLIF(trim(p_action),'') IS NULL
 OR NULLIF(trim(p_resolved_rpc),'') IS NULL OR p_resolved_args IS NULL
 OR NULLIF(trim(p_risk_class),'') IS NULL OR p_expires_at IS NULL
 THEN RETURN jsonb_build_object('ok',false,'error','invalid_confirmation_request'); END IF;

 -- DB-side structural guard; n8n action catalog remains the authoritative allowlist.
 IF trim(p_resolved_rpc) !~ '^rpc_[a-z0-9_]+$'
 THEN RETURN jsonb_build_object('ok',false,'error','invalid_resolved_rpc'); END IF;

 SELECT s.teacher_id,s.school_id,s.role INTO v_sess FROM public.app_web_sessions s
 JOIN public.teachers t ON t.teacher_id=s.teacher_id AND t.school_id=s.school_id AND t.role=s.role
 WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
 IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 IF p_expires_at<=now() OR p_expires_at>now()+interval '5 minutes'
 THEN RETURN jsonb_build_object('ok',false,'error','invalid_expiry'); END IF;
 v_session_id:=encode(digest(p_session_token,'sha256'),'hex');
 UPDATE public.ai_confirmation_pending SET cancelled_at=now()
 WHERE session_id=v_session_id AND consumed_at IS NULL AND cancelled_at IS NULL;
 INSERT INTO public.ai_confirmation_pending(confirmation_id,session_id,teacher_id,school_id,action_digest,action,resolved_rpc,resolved_args,risk_class,expires_at)
 VALUES(trim(p_confirmation_id),v_session_id,v_sess.teacher_id,v_sess.school_id,trim(p_action_digest),trim(p_action),trim(p_resolved_rpc),p_resolved_args,trim(p_risk_class),p_expires_at);
 RETURN jsonb_build_object('ok',true,'status','pending','confirmation_id',trim(p_confirmation_id),'action_digest',trim(p_action_digest),'expires_at',p_expires_at);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'error','confirmation_conflict'); END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_ai_confirmation_consume(
 p_session_token text,p_confirmation_id text,p_action_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $function$
DECLARE v_sess record; v_row record; v_session_id text;
BEGIN
 IF NULLIF(trim(p_session_token),'') IS NULL OR NULLIF(trim(p_confirmation_id),'') IS NULL OR NULLIF(trim(p_action_digest),'') IS NULL
 THEN RETURN jsonb_build_object('ok',false,'error','invalid_confirmation_request'); END IF;
 SELECT s.teacher_id,s.school_id,s.role INTO v_sess FROM public.app_web_sessions s
 JOIN public.teachers t ON t.teacher_id=s.teacher_id AND t.school_id=s.school_id AND t.role=s.role
 WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
 IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 v_session_id:=encode(digest(p_session_token,'sha256'),'hex');
 SELECT * INTO v_row FROM public.ai_confirmation_pending WHERE confirmation_id=trim(p_confirmation_id) FOR UPDATE;
 IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'error','confirmation_not_found'); END IF;
 IF v_row.session_id<>v_session_id OR v_row.teacher_id<>v_sess.teacher_id OR v_row.school_id<>v_sess.school_id
 THEN RETURN jsonb_build_object('ok',false,'error','confirmation_scope_mismatch'); END IF;
 IF v_row.action_digest<>trim(p_action_digest) THEN RETURN jsonb_build_object('ok',false,'error','confirmation_digest_mismatch'); END IF;
 IF v_row.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','confirmation_already_consumed'); END IF;
 IF v_row.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','confirmation_cancelled'); END IF;
 IF v_row.expires_at<=now() THEN
   UPDATE public.ai_confirmation_pending SET cancelled_at=now() WHERE confirmation_id=v_row.confirmation_id AND consumed_at IS NULL AND cancelled_at IS NULL;
   RETURN jsonb_build_object('ok',false,'error','confirmation_expired');
 END IF;
 UPDATE public.ai_confirmation_pending SET consumed_at=now() WHERE confirmation_id=v_row.confirmation_id AND consumed_at IS NULL AND cancelled_at IS NULL RETURNING * INTO v_row;
 IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'error','confirmation_consume_conflict'); END IF;
 RETURN jsonb_build_object('ok',true,'status','consumed','confirmation_id',v_row.confirmation_id,'action_digest',v_row.action_digest,'action',v_row.action,'resolved_rpc',v_row.resolved_rpc,'resolved_args',v_row.resolved_args,'risk_class',v_row.risk_class,'consumed_at',v_row.consumed_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_ai_confirmation_cancel(
 p_session_token text,p_confirmation_id text,p_action_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $function$
DECLARE v_sess record; v_session_id text; v_row record;
BEGIN
 SELECT s.teacher_id,s.school_id,s.role INTO v_sess FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id AND t.school_id=s.school_id AND t.role=s.role
 WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
 IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
 v_session_id:=encode(digest(p_session_token,'sha256'),'hex');
 UPDATE public.ai_confirmation_pending SET cancelled_at=now()
 WHERE confirmation_id=trim(p_confirmation_id) AND action_digest=trim(p_action_digest) AND session_id=v_session_id
 AND teacher_id=v_sess.teacher_id AND school_id=v_sess.school_id AND consumed_at IS NULL AND cancelled_at IS NULL
 RETURNING confirmation_id,cancelled_at INTO v_row;
 IF v_row IS NULL THEN RETURN jsonb_build_object('ok',false,'error','confirmation_not_found_or_already_closed'); END IF;
 RETURN jsonb_build_object('ok',true,'status','cancelled','confirmation_id',v_row.confirmation_id,'cancelled_at',v_row.cancelled_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_ai_confirmation_create(text,text,text,text,text,jsonb,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_confirmation_consume(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_confirmation_cancel(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_ai_confirmation_create(text,text,text,text,text,jsonb,text,timestamptz) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_confirmation_consume(text,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_confirmation_cancel(text,text,text) TO anon,authenticated;
