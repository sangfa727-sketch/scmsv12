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
    const chain = raw.split(",").map(part => part.trim()).filter(Boolean);
    const value = header === "x-forwarded-for" ? chain.at(-1) ?? "" : raw.trim();
    if (value && value.length <= 128) return value;
  }
  return null;
}

async function hmacIdentity(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readBodyLimited(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty_body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_CHARS) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
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
  const rateLimitSalt = Deno.env.get("SCMS_ADMISSION_RATE_LIMIT_SALT");
  if (!supabaseUrl || !serviceRoleKey || !rateLimitSalt || rateLimitSalt.length < 32) {
    return json({ ok: false, error: "backend_unavailable" }, 503, origin.origin);
  }

  try {
    let raw: string;
    try {
      raw = await readBodyLimited(request);
    } catch (error) {
      if (error instanceof Error && error.message === "body_too_large") {
        return json({ ok: false, error: "invalid_request_size" }, 413, origin.origin);
      }
      return json({ ok: false, error: "invalid_request_body" }, 400, origin.origin);
    }
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
      p_identity_hash: await hmacIdentity(identity, rateLimitSalt),
      p_idempotency_key: body.idempotencyKey,
      p_student_name: body.student_name,
      p_date_of_birth: body.date_of_birth ?? "",
      p_applying_grade: body.applying_grade,
      p_guardian_name: body.guardian_name,
      p_guardian_phone: body.guardian_phone,
      p_guardian_email: body.guardian_email ?? "",
      p_previous_school: body.previous_school ?? "",
      p_preferred_contact: body.preferred_contact ?? "phone",
      p_message: body.message ?? "",
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
