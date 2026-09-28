-- Internal billing authorization helper; client roles must not call it directly.
revoke execute on function public._billing_admin_session(text) from public, anon, authenticated;
