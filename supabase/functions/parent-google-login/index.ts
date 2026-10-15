import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const MAX_BODY_BYTES = 16 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function readBoundedJson(req: Request): Promise<unknown> {
  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error("unsupported_content_type");
  }
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    throw new Error("body_too_large");
  }
  if (!req.body) throw new Error("invalid_json");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Parent Portal login: verify the Google ID token before invoking the
// service-role-only RPC. Keep this source in version control so RPC grant
// changes and the trusted caller can be reviewed together.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await readBoundedJson(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "body_too_large") return json({ ok: false, error: "body_too_large" }, 413);
    if (message === "unsupported_content_type") return json({ ok: false, error: "unsupported_content_type" }, 415);
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const idToken = body?.id_token;
  const qrToken = body?.qr_token;
  const deviceUa = body?.device_ua;

  if (typeof idToken !== "string" || !idToken.trim()) return json({ ok: false, error: "missing_id_token" }, 400);
  if (typeof qrToken !== "string" || !qrToken.trim()) return json({ ok: false, error: "missing_qr_token" }, 400);
  if (!GOOGLE_CLIENT_ID) return json({ ok: false, error: "server_misconfigured", message: "GOOGLE_CLIENT_ID not set" }, 500);

  let claims: Record<string, unknown>;
  try {
    const verifyResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!verifyResp.ok) return json({ ok: false, error: "invalid_google_token" }, 401);
    claims = await verifyResp.json();
  } catch {
    return json({ ok: false, error: "google_verify_failed" }, 502);
  }

  if (claims.aud !== GOOGLE_CLIENT_ID) return json({ ok: false, error: "audience_mismatch" }, 401);
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    return json({ ok: false, error: "issuer_mismatch" }, 401);
  }
  if (claims.email_verified !== "true" && claims.email_verified !== true) {
    return json({ ok: false, error: "email_not_verified" }, 401);
  }

  // Google ID tokens must carry a numeric expiry. Missing or malformed exp
  // claims fail closed instead of bypassing the expiry comparison.
  const exp = Number(claims.exp);
  if (claims.exp === undefined || claims.exp === null || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return json({ ok: false, error: "token_expired" }, 401);
  }
  if (typeof claims.email !== "string" || !claims.email.trim()) {
    return json({ ok: false, error: "email_missing" }, 401);
  }

  try {
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_parent_google_login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_qr_token: qrToken,
        p_google_email: claims.email,
        p_device_ua: typeof deviceUa === "string" ? deviceUa.slice(0, 512) : null,
      }),
    });
    const result = await rpcResp.json();
    return json(result, rpcResp.ok ? 200 : 400);
  } catch {
    return json({ ok: false, error: "rpc_call_failed" }, 502);
  }
});
