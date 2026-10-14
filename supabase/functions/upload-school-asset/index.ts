import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

function matchesImageSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (type === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

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
    const studentId = String(form.get("student_id") || "").trim();
    const file = form.get("file");

    if (!sessionToken) return json({ error: "Missing session" }, 401);
    if (!["logo", "cover", "teacher", "student"].includes(kind)) {
      return json({ error: "Invalid asset type" }, 400);
    }
    if (!(file instanceof File)) return json({ error: "Missing image" }, 400);

    const maxBytes = kind === "student" ? 3 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size <= 0 || file.size > maxBytes) {
      return json({
        error: kind === "student"
          ? "Student photo exceeds the 3 MB limit"
          : "Image exceeds the 5 MB limit",
      }, 400);
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return json({ error: "Unsupported image type" }, 400);
    }
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageSignature(file.type, imageBytes)) {
      return json({ error: "Image content does not match its declared type" }, 400);
    }

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };

    type UploadSession = {
      teacher_id?: string;
      school_id?: string;
      role?: string;
      telegram_id?: string;
      expires_at?: string;
      token?: string;
    };
    let session: UploadSession | null = null;
    let sessionKind: "web" | "telegram" | null = null;

    const webSessionUrl = new URL(`${supabaseUrl}/rest/v1/app_web_sessions`);
    webSessionUrl.searchParams.set("session_token", `eq.${sessionToken}`);
    webSessionUrl.searchParams.set("select", "teacher_id,school_id,role,expires_at");
    webSessionUrl.searchParams.set("limit", "1");
    const webSessionResp = await fetch(webSessionUrl, { headers });
    if (!webSessionResp.ok) return json({ error: "Session lookup failed" }, 500);
    const webSessions = await webSessionResp.json();
    const webSession = webSessions[0];
    if (webSession && webSession.expires_at &&
        new Date(webSession.expires_at).getTime() > Date.now()) {
      session = webSession;
      sessionKind = "web";
    } else {
      // Native/TWA Telegram sessions use a high-entropy token and have no
      // expires_at column; accept only linked rows and revalidate live identity.
      const appSessionUrl = new URL(`${supabaseUrl}/rest/v1/app_sessions`);
      appSessionUrl.searchParams.set("token", `eq.${sessionToken}`);
      appSessionUrl.searchParams.set("status", "eq.linked");
      appSessionUrl.searchParams.set("select", "token,telegram_id,teacher_id,school_id,status");
      appSessionUrl.searchParams.set("limit", "1");
      const appSessionResp = await fetch(appSessionUrl, { headers });
      if (!appSessionResp.ok) return json({ error: "Session lookup failed" }, 500);
      const appSessions = await appSessionResp.json();
      const appSession = appSessions[0];
      if (!appSession || typeof appSession.token !== "string" || appSession.token.length < 32) {
        return json({ error: "Session expired" }, 401);
      }
      session = appSession;
      sessionKind = "telegram";
    }

    if (!session || !sessionKind) {
      return json({ error: "Session expired" }, 401);
    }

    const teacherUrl = new URL(`${supabaseUrl}/rest/v1/teachers`);
    teacherUrl.searchParams.set("teacher_id", `eq.${String(session.teacher_id || "")}`);
    teacherUrl.searchParams.set("select", "teacher_id,school_id,role,status,telegram_id");
    teacherUrl.searchParams.set("limit", "1");
    const teacherResp = await fetch(teacherUrl, { headers });
    if (!teacherResp.ok) return json({ error: "Teacher lookup failed" }, 500);
    const teachers = await teacherResp.json();
    const teacher = teachers[0];
    if (!teacher || String(teacher.status || "").toLowerCase() !== "active" ||
        teacher.school_id !== session.school_id ||
        (sessionKind === "web" && teacher.role !== session.role) ||
        (sessionKind === "telegram" && teacher.telegram_id !== session.telegram_id)) {
      return json({ error: "Session is not authorized" }, 403);
    }
    if (sessionKind === "telegram") session.role = teacher.role;

    const schoolUrl = new URL(`${supabaseUrl}/rest/v1/schools`);
    schoolUrl.searchParams.set("school_id", `eq.${session.school_id}`);
    schoolUrl.searchParams.set("select", "school_id,status");
    schoolUrl.searchParams.set("limit", "1");
    const schoolResp = await fetch(schoolUrl, { headers });
    if (!schoolResp.ok) return json({ error: "School lookup failed" }, 500);
    const schools = await schoolResp.json();
    if (!schools[0] || String(schools[0].status || "").toLowerCase() !== "active") {
      return json({ error: "School is not active" }, 403);
    }

    let authorizedSchoolId = session.school_id;
    if (kind === "student") {
      if (!studentId) return json({ error: "Missing student ID" }, 400);
      const authResp = await fetch(`${supabaseUrl}/rest/v1/rpc/rpc_authorize_student_photo_upload`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_session_token: sessionToken,
          p_student_id: studentId,
        }),
      });
      if (!authResp.ok) {
        console.error("[upload-school-asset] student photo authorization RPC failed", authResp.status);
        return json({ error: "Student photo authorization failed" }, 500);
      }
      const authorization = await authResp.json();
      if (!authorization?.ok || authorization.school_id !== session.school_id ||
          authorization.student_id !== studentId) {
        return json({ error: authorization?.error || "Student photo permission denied" }, 403);
      }
      authorizedSchoolId = authorization.school_id;
    }

    if ((kind === "logo" || kind === "cover") &&
        (typeof session.role !== "string" ||
         !["admin", "super_admin"].includes(session.role))) {
      return json({ error: "Admin access required" }, 403);
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const bucket = kind === "student" ? "student-photos" : "school-assets";
    const path = kind === "student"
      ? `${authorizedSchoolId}/${crypto.randomUUID()}.${ext}`
      : `${authorizedSchoolId}/${kind}/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
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

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
    return json({ ok: true, url: publicUrl, kind });
  } catch (err) {
    console.error("[upload-school-asset] unexpected error", err);
    return json({ error: "Upload failed" }, 500);
  }
});
