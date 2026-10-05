-- Library permission contract: view/manage gates without changing existing RPC bodies.
-- Preserves live function signatures, return shapes, school isolation, and business logic.

BEGIN;

INSERT INTO public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active, display_order)
VALUES
  ('library.view', 'library', 'View library books and checkout records', 'global', false, true, 90),
  ('library.manage', 'library', 'Manage library books and checkouts', 'global', false, true, 91)
ON CONFLICT (permission_key) DO UPDATE
SET category = EXCLUDED.category,
    description = EXCLUDED.description,
    scope_type = EXCLUDED.scope_type,
    is_sensitive = EXCLUDED.is_sensitive,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order;

INSERT INTO public.role_permissions (role, permission_key, allowed)
VALUES
  ('admin', 'library.view', true),
  ('admin', 'library.manage', true),
  ('super_admin', 'library.view', true),
  ('super_admin', 'library.manage', true),
  ('teacher', 'library.view', false),
  ('teacher', 'library.manage', false)
ON CONFLICT (role, permission_key) DO UPDATE
SET allowed = EXCLUDED.allowed;

DO $$
DECLARE
  v_item record;
  v_def text;
  v_marker text := E'  IF v_sess IS NULL THEN\n    RETURN jsonb_build_object(''ok'', false, ''error'', ''invalid_session'');\n  END IF;\n';
  v_gate text;
BEGIN
  FOR v_item IN
    SELECT *
    FROM (VALUES
      ('rpc_get_books(text)'::regprocedure, 'library.view'),
      ('rpc_get_book_checkouts(text,bigint)'::regprocedure, 'library.view'),
      ('rpc_add_book(text,text,text,text,text,integer,text)'::regprocedure, 'library.manage'),
      ('rpc_update_book(text,bigint,text,text,text,text,integer,text)'::regprocedure, 'library.manage'),
      ('rpc_delete_book(text,bigint)'::regprocedure, 'library.manage'),
      ('rpc_checkout_book(text,bigint,text,date,text)'::regprocedure, 'library.manage'),
      ('rpc_return_book(text,bigint)'::regprocedure, 'library.manage')
    ) AS x(fn, permission_key)
  LOOP
    SELECT pg_get_functiondef(v_item.fn) INTO v_def;

    IF position('private.web_has_permission' in v_def) > 0 THEN
      CONTINUE;
    END IF;

    IF position(v_marker in v_def) = 0 THEN
      RAISE EXCEPTION 'Library permission migration refused: session marker missing for %', v_item.fn;
    END IF;

    v_gate := E'  IF NOT private.web_has_permission(p_session_token, ''' ||
      v_item.permission_key || E''') THEN\n    RETURN jsonb_build_object(''ok'', false, ''error'', ''permission_denied'');\n  END IF;\n';

    v_def := replace(v_def, v_marker, v_marker || E'\n' || v_gate);
    EXECUTE v_def;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.rpc_get_books(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_book_checkouts(text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_add_book(text,text,text,text,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_book(text,bigint,text,text,text,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delete_book(text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_checkout_book(text,bigint,text,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_return_book(text,bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_get_books(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_book_checkouts(text,bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_add_book(text,text,text,text,text,integer,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_book(text,bigint,text,text,text,text,integer,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_book(text,bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_checkout_book(text,bigint,text,date,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_return_book(text,bigint) TO anon, authenticated;

COMMIT;
