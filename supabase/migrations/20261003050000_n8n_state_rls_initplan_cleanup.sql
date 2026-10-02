-- Avoid per-row auth.role() evaluation in the n8n_state service-role policy.
DROP POLICY IF EXISTS service_role_all ON public.n8n_state;
CREATE POLICY service_role_all ON public.n8n_state
  FOR ALL TO service_role
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');
