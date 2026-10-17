import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration error" }, 500);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ error: "Expected JSON" }, 400);
  }

  let body: { session_token?: unknown; student_ids?: unknown };
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 32 * 1024) {
      return json({ error: "Request body too large" }, 413);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Invalid JSON body" }, 400);
    }
    body = parsed as { session_token?: unknown; student_ids?: unknown };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sessionToken = typeof body.session_token === "string" ? body.session_token.trim() : "";
  const studentIds = Array.isArray(body.student_ids)
    ? [...new Set(body.student_ids.filter((id): id is string =>
        typeof id === "string" && id.trim().length > 0).map(id => id.trim()))]
    : [];

  if (!sessionToken || sessionToken.length > 512) return json({ error: "Missing session" }, 401);
  if (!studentIds.length || studentIds.length > 100 ||
      studentIds.some(id => id.length > 128)) {
    return json({ error: "Provide between 1 and 100 valid student IDs" }, 400);
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const photos: Record<string, string> = {};
  const unavailable: string[] = [];
  try {
    // Each ID is independently authorized. A denied/missing photo is omitted;
    // it never causes a cross-student or cross-school fallback.
    for (const studentId of studentIds) {
      const authResp = await fetch(
        `${supabaseUrl}/rest/v1/rpc/rpc_authorize_student_photo_read`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_session_token: sessionToken,
            p_student_id: studentId,
          }),
        },
      );
      if (!authResp.ok) {
        console.error("[student-photo-signed-urls] authorization RPC failed", authResp.status);
        return json({ error: "Photo authorization service unavailable" }, 502);
      }

      const authorization = await authResp.json();
      if (!authorization?.ok || typeof authorization.object_path !== "string") {
        unavailable.push(studentId);
        continue;
      }

      const path = authorization.object_path;
      const schoolPrefix = `${authorization.school_id}/`;
      if (!path.startsWith(schoolPrefix) || path.includes("..") ||
          path.startsWith("/") || path.includes(String.fromCharCode(92))) {
        console.error("[student-photo-signed-urls] rejected invalid authorized object path");
        unavailable.push(studentId);
        continue;
      }

      const signResp = await fetch(
        `${supabaseUrl}/storage/v1/object/sign/student-photos/${path.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ expiresIn: 300 }),
        },
      );
      if (!signResp.ok) {
        // A missing object can be stale DB data; do not leak details to callers.
        unavailable.push(studentId);
        continue;
      }
      const signed = await signResp.json();
      const signedPath = typeof signed?.signedURL === "string" ? signed.signedURL : "";
      if (!signedPath || !signedPath.startsWith("/")) {
        unavailable.push(studentId);
        continue;
      }
      const signedUrl = signedPath.startsWith("/storage/v1/")
        ? `${supabaseUrl}${signedPath}`
        : `${supabaseUrl}/storage/v1${signedPath}`;
      photos[studentId] = signedUrl;
    }

    return json({ ok: true, photos, unavailable });
  } catch (error) {
    console.error("[student-photo-signed-urls] unexpected error", error);
    return json({ error: "Unable to load student photos" }, 500);
  }
});
