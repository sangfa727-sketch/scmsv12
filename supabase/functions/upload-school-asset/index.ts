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

  try {
    const form = await req.formData();
    const sessionToken = String(form.get("session_token") || "").trim();
    const kind = String(form.get("kind") || "").trim();
    const file = form.get("file");

    if (!sessionToken) return json({ error: "Missing session" }, 401);
    if (!["logo", "cover", "teacher"].includes(kind)) {
      return json({ error: "Invalid asset type" }, 400);
    }
    if (!(file instanceof File)) return json({ error: "Missing image" }, 400);
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      return json({ error: "Image exceeds the 5 MB limit" }, 400);
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return json({ error: "Unsupported image type" }, 400);
    }

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };

    const sessionUrl = new URL(`${supabaseUrl}/rest/v1/app_web_sessions`);
    sessionUrl.searchParams.set("session_token", `eq.${sessionToken}`);
    sessionUrl.searchParams.set("select", "teacher_id,school_id,role,expires_at");
    sessionUrl.searchParams.set("limit", "1");
    const sessionResp = await fetch(sessionUrl, { headers });
    if (!sessionResp.ok) return json({ error: "Session lookup failed" }, 500);
    const sessions = await sessionResp.json();
    const session = sessions[0];
    if (!session || !session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return json({ error: "Session expired" }, 401);
    }

    const teacherUrl = new URL(`${supabaseUrl}/rest/v1/teachers`);
    teacherUrl.searchParams.set("teacher_id", `eq.${session.teacher_id}`);
    teacherUrl.searchParams.set("select", "teacher_id,school_id,role,status");
    teacherUrl.searchParams.set("limit", "1");
    const teacherResp = await fetch(teacherUrl, { headers });
    if (!teacherResp.ok) return json({ error: "Teacher lookup failed" }, 500);
    const teachers = await teacherResp.json();
    const teacher = teachers[0];
    if (!teacher || teacher.status !== "Active" ||
        teacher.school_id !== session.school_id ||
        teacher.role !== session.role) {
      return json({ error: "Session is not authorized" }, 403);
    }

    if ((kind === "logo" || kind === "cover") &&
        !["admin", "super_admin"].includes(session.role)) {
      return json({ error: "Admin access required" }, 403);
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${session.school_id}/${kind}/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/school-assets/${path}`;
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": file.type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-upsert": "false",
      },
      body: file,
    });

    if (!uploadResp.ok) {
      const detail = await uploadResp.text().catch(() => "");
      console.error("[upload-school-asset] storage upload failed", uploadResp.status, detail.slice(0, 300));
      return json({ error: "Asset upload failed" }, 502);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/school-assets/${path}`;
    return json({ ok: true, url: publicUrl, kind });
  } catch (err) {
    console.error("[upload-school-asset] unexpected error", err);
    return json({ error: "Upload failed" }, 500);
  }
});
