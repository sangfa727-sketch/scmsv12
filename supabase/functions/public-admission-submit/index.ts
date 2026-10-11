import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MAX_BODY_CHARS = 16_000;
const RATE_IDENTITY_HEADERS = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"];

function json(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function trustedOrigin(request: Request): { origin: string; hostname: string } | null {
  const value = request.headers.get("origin");
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port) return null;
    return { origin: parsed.origin, hostname: parsed.hostname.toLowerCase().replace(/\.$/, "") };
  } catch {
    return null;
  }
}

function requestIdentity(request: Request): string | null {
  // Configure the edge proxy to overwrite these headers. Do not forward a
  // client-supplied IP header unchanged in production.
  for (const header of RATE_IDENTITY_HEADERS) {
    const raw = request.headers.get(header);
    if (!raw) continue;
    const value = header === "x-forwarded-for" ? raw.split(",")[0].trim() : raw.trim();
    if (value && value.length <= 128) return value;
  }
  return null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  const origin = trustedOrigin(request);
  if (request.method === "OPTIONS") {
    return origin
      ? new Response(null, { status: 204, headers: {
          "Access-Control-Allow-Origin": origin.origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Max-Age": "600",
          "Vary": "Origin",
        } })
      : json({ ok: false, error: "invalid_origin" }, 403, null);
  }
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin?.origin ?? null);
  if (!origin) return json({ ok: false, error: "invalid_origin" }, 403, null);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "invalid_content_type" }, 415, origin.origin);
  }

  const identity = requestIdentity(request);
  if (!identity) return json({ ok: false, error: "rate_limit_identity_unavailable" }, 503, origin.origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: "backend_unavailable" }, 503, origin.origin);

  try {
    const raw = await request.text();
    if (raw.length === 0 || raw.length > MAX_BODY_CHARS) return json({ ok: false, error: "invalid_request_size" }, 413, origin.origin);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, error: "invalid_input" }, 400, origin.origin);
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400, origin.origin);
    }
    if (typeof body.website === "string" && body.website.trim()) return json({ ok: false, error: "invalid_request" }, 400, origin.origin);

    const payload = {
      p_hostname: origin.hostname,
      p_identity_hash: await sha256(identity),
      p_idempotency_key: body.idempotencyKey,
      p_student_name: body.studentName,
      p_guardian_name: body.guardianName,
      p_phone: body.phone,
      p_email: body.email ?? "",
      p_grade: body.grade,
      p_note: body.note ?? "",
    };
    const response = await fetch(new URL("/rest/v1/rpc/rpc_website_admission_submit", supabaseUrl), {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error("[public-admission-submit] database RPC failed", response.status);
      return json({ ok: false, error: "backend_unavailable" }, 503, origin.origin);
    }
    const result = await response.json();
    if (result?.ok === true) return json({ ok: true, status: "pending" }, 201, origin.origin);
    if (result?.error === "unknown_school") return json({ ok: false, error: "unknown_school" }, 404, origin.origin);
    if (result?.error === "rate_limited") return json({ ok: false, error: "rate_limited" }, 429, origin.origin);
    if (result?.error === "duplicate_request") return json({ ok: false, error: "duplicate_request" }, 409, origin.origin);
    return json({ ok: false, error: "invalid_input" }, 400, origin.origin);
  } catch (error) {
    console.error("[public-admission-submit] request failed", error);
    return json({ ok: false, error: "backend_unavailable" }, 503, origin.origin);
  }
});
