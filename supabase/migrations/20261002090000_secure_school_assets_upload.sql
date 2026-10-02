-- SCMS v12 — secure school-assets upload boundary
-- Browser uploads must go through the authenticated Edge Function, which
-- validates the existing app_web_sessions session and uses service role
-- credentials server-side. Public reads remain unchanged.
drop policy if exists "anon upload school assets" on storage.objects;
