const ALLOWED_ORIGINS = new Set(["https://mslm8.github.io"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://mslm8.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
const MODELS = { image: "fal-ai/flux/dev", video: "fal-ai/ovi" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function authenticate(req: Request) {
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  const projectUrl = Deno.env.get("SUPABASE_URL") || "https://zgqqbwwjcyndlfcccpih.supabase.co";
  const apiKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!token || !apiKey) return { ok: false, status: 401, detail: "Missing bearer user session or apikey header." };
  try {
    const response = await fetchWithTimeout(projectUrl + "/auth/v1/user", { method: "GET", headers: { "Authorization": "Bearer " + token, "apikey": apiKey } }, 10000);
    if (!response.ok) return { ok: false, status: 401, detail: "Supabase rejected the user session (HTTP " + response.status + ")." };
    const user = await response.json().catch(() => null);
    return user && typeof user.id === "string" ? { ok: true, userId: user.id } : { ok: false, status: 401, detail: "Supabase returned an invalid user payload." };
  } catch (error) {
    return { ok: false, status: 503, detail: "Authentication verification failed: " + String(error instanceof Error ? error.message : error).slice(0, 240) };
  }
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const cors = origin && ALLOWED_ORIGINS.has(origin) ? { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin } : CORS_HEADERS;
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403, headers: CORS_HEADERS });
    return new Response(null, { status: 204, headers: cors });
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed.", code: "CORS_ORIGIN" }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const auth = await authenticate(req);
    if (!auth.ok) {
      console.warn("fal-gateway auth rejected", { requestId, status: auth.status, detail: auth.detail });
      return json({ error: auth.detail, code: auth.status === 503 ? "AUTH_SERVICE_UNAVAILABLE" : "AUTH_REQUIRED", request_id: requestId }, auth.status);
    }
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body.", code: "INVALID_JSON", request_id: requestId }, 400); }
    const action = String(body.action || "");
    const falKey = Deno.env.get("FAL_KEY");
    if (action === "health") return json({ ok: true, configured: Boolean(falKey), paidProviderOptional: true, imageModel: MODELS.image, videoModel: MODELS.video, request_id: requestId });
    if (!falKey) return json({ error: "Optional FAL_KEY is not configured; the free animation path does not require it.", code: "OPTIONAL_PROVIDER_NOT_CONFIGURED", request_id: requestId }, 503);
    const task = String(body.task || "");
    const model = MODELS[task as keyof typeof MODELS];
    if (!model) return json({ error: "Unsupported task. Use image or video.", code: "UNSUPPORTED_TASK" }, 400);
    const headers = { "Authorization": "Key " + falKey, "Content-Type": "application/json" };
    let upstream: Response;
    if (action === "submit") {
      const prompt = String(body.prompt || "").trim();
      if (prompt.length < 4 || prompt.length > 5000) return json({ error: "Prompt must contain 4 to 5000 characters.", code: "INVALID_PROMPT" }, 400);
      const input = task === "image" ? { prompt, image_size: "landscape_16_9", num_images: 1, output_format: "png", enable_safety_checker: true } : { prompt, resolution: "992x512", negative_prompt: "jitter, blur, flicker, distorted anatomy, unstable camera" };
      try { upstream = await fetchWithTimeout("https://queue.fal.run/" + model, { method: "POST", headers, body: JSON.stringify(input) }, 30000); }
      catch (error) {
        const detail = String(error instanceof Error ? error.message : error);
        console.error("fal-gateway upstream submit failed", { requestId, task, detail });
        return json({ error: "Provider network or timeout error.", code: /abort|timeout/i.test(detail) ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK", detail: detail.slice(0, 300), request_id: requestId }, 502);
      }
    } else if (action === "status" || action === "result") {
      const providerRequestId = String(body.request_id || "");
      if (!/^[A-Za-z0-9-]{8,128}$/.test(providerRequestId)) return json({ error: "Invalid request_id.", code: "INVALID_REQUEST_ID" }, 400);
      const suffix = action === "status" ? "/status" : "";
      try { upstream = await fetchWithTimeout("https://queue.fal.run/" + model + "/requests/" + encodeURIComponent(providerRequestId) + suffix, { method: "GET", headers: { "Authorization": "Key " + falKey } }, 20000); }
      catch (error) {
        const detail = String(error instanceof Error ? error.message : error);
        console.error("fal-gateway upstream lookup failed", { requestId, task, detail });
        return json({ error: "Provider network or timeout error.", code: /abort|timeout/i.test(detail) ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK", detail: detail.slice(0, 300), request_id: requestId }, 502);
      }
    } else return json({ error: "Unsupported action. Use health, submit, status or result.", code: "UNSUPPORTED_ACTION" }, 400);
    const raw = await upstream.text();
    let payload: Record<string, unknown>;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch {
      console.error("fal-gateway invalid provider JSON", { requestId, status: upstream.status, bodyPreview: raw.slice(0, 300) });
      return json({ error: "Provider returned invalid JSON.", code: "UPSTREAM_INVALID_JSON", request_id: requestId }, 502);
    }
    if (!upstream.ok) {
      const detail = String(payload.detail || payload.message || upstream.statusText).slice(0, 500);
      console.error("fal-gateway provider rejected request", { requestId, task, status: upstream.status, detail });
      return json({ error: "Provider request failed.", code: upstream.status === 401 || upstream.status === 403 ? "UPSTREAM_AUTH" : upstream.status === 429 ? "UPSTREAM_RATE_LIMIT" : upstream.status >= 500 ? "UPSTREAM_SERVER" : "UPSTREAM_REQUEST", detail, upstream_status: upstream.status, request_id: requestId }, upstream.status >= 500 ? 502 : upstream.status);
    }
    return json({ task, model, ...payload, request_id: requestId }, action === "submit" ? 202 : 200);
  } catch (error) {
    const detail = String(error instanceof Error ? error.stack || error.message : error).slice(0, 900);
    console.error("fal-gateway unhandled exception", { requestId, detail });
    return json({ error: "Unexpected Edge Function error.", code: "EDGE_UNHANDLED", detail: detail.slice(0, 500), request_id: requestId }, 500);
  }
});