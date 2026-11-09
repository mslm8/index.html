const ALLOWED_ORIGINS = new Set(["https://mslm8.github.io"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://mslm8.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
const MODELS = { image: "fal-ai/flux/dev", video: "fal-ai/ovi" };

function json(data: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra }
  });
}
function classifyStatus(status: number) {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 404) return "NOT_FOUND";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "UPSTREAM_SERVER";
  return "REQUEST";
}
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function authenticate(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const projectUrl = Deno.env.get("SUPABASE_URL") || "https://zgqqbwwjcyndlfcccpih.supabase.co";
  const apiKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!token || !apiKey) return { ok: false, status: 401, detail: "Missing bearer user session or apikey header." };
  try {
    const response = await fetchWithTimeout(projectUrl + "/auth/v1/user", {
      method: "GET",
      headers: { "Authorization": "Bearer " + token, "apikey": apiKey }
    }, 10000);
    if (!response.ok) return { ok: false, status: 401, detail: "Supabase rejected the user session (HTTP " + response.status + ")." };
    const user = await response.json().catch(() => null);
    if (!user || typeof user.id !== "string") return { ok: false, status: 401, detail: "Supabase returned an invalid user payload." };
    return { ok: true, userId: user.id };
  } catch (error) {
    return { ok: false, status: 503, detail: "Authentication verification failed: " + String(error instanceof Error ? error.message : error).slice(0, 240) };
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const cors = origin && ALLOWED_ORIGINS.has(origin)
    ? { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin }
    : CORS_HEADERS;

  // Preflight must be answered before authentication or request-body parsing.
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

    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (declaredLength > 2 * 1024 * 1024) {
      return json({ error: "Request body is too large.", code: "REQUEST_TOO_LARGE", request_id: requestId }, 413);
    }
    let body: Record<string, unknown>;
    try {
      const rawBody = await req.text();
      if (rawBody.length > 2 * 1024 * 1024) {
        return json({ error: "Request body is too large.", code: "REQUEST_TOO_LARGE", request_id: requestId }, 413);
      }
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "JSON body must be an object.", code: "INVALID_BODY", request_id: requestId }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body.", code: "INVALID_JSON", request_id: requestId }, 400);
    }

    const action = String(body.action || "");
    const falKey = Deno.env.get("FAL_KEY");
    const cloudflareAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
    const cloudflareToken = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
    if (action === "health") {
      return json({
        ok: true,
        configured: Boolean(falKey),
        paidProviderOptional: true,
        imageModel: MODELS.image,
        videoModel: MODELS.video,
        cloudflareImageConfigured: Boolean(cloudflareAccountId && cloudflareToken),
        cloudflareImageCredentialState: cloudflareAccountId && cloudflareToken ? "configured_unverified" : "missing",
        cloudflareImageHealthNote: "Secret presence is checked here; actual token permissions are verified only by a real image request.",
        cloudflareImageModel: "@cf/black-forest-labs/flux-1-schnell",
        cloudflareReferenceEditModel: "@cf/black-forest-labs/flux-2-klein-4b",
        cloudflareReferenceEditConfigured: Boolean(cloudflareAccountId && cloudflareToken),
        request_id: requestId
      });
    }
    if (action === "cloudflare-image") {
      if (!cloudflareAccountId || !cloudflareToken) {
        return json({ error: "Cloudflare Workers AI is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN as Supabase Edge Function secrets.", code: "CLOUDFLARE_NOT_CONFIGURED", request_id: requestId }, 503);
      }
      const prompt = String(body.prompt || "").trim();
      if (prompt.length < 4 || prompt.length > 2048) {
        return json({ error: "Prompt must contain 4 to 2048 characters.", code: "INVALID_PROMPT", request_id: requestId }, 400);
      }
      try {
        const upstream = await fetchWithTimeout(
          "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cloudflareAccountId) + "/ai/run/@cf/black-forest-labs/flux-1-schnell",
          {
            method: "POST",
            headers: { "Authorization": "Bearer " + cloudflareToken, "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, steps: 4, seed: Math.floor(Math.random() * 2147483647) })
          },
          60000
        );
        const raw = await upstream.text();
        let payload: Record<string, unknown>;
        try { payload = raw ? JSON.parse(raw) : {}; }
        catch {
          console.error("fal-gateway Cloudflare invalid JSON", { requestId, status: upstream.status, bodyPreview: raw.slice(0, 240) });
          return json({ error: "Cloudflare returned an invalid response.", code: "CLOUDFLARE_INVALID_RESPONSE", request_id: requestId }, 502);
        }
        const result = payload.result && typeof payload.result === "object" ? payload.result as Record<string, unknown> : {};
        const image = typeof result.image === "string" ? result.image.trim() : "";
        const validBase64Image = image.length >= 1000 && image.length <= 8 * 1024 * 1024 &&
          image.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(image);
        if (!upstream.ok || payload.success === false || !validBase64Image) {
          const errors = Array.isArray(payload.errors) ? payload.errors : [];
          const detail = String((errors[0] as Record<string, unknown> | undefined)?.message || payload.message || upstream.statusText || "No image returned").slice(0, 400);
          console.warn("fal-gateway Cloudflare image failed", { requestId, status: upstream.status, detail });
          const responseStatus = !upstream.ok ? (upstream.status >= 500 ? 502 : upstream.status) : 502;
          const retryAfter = upstream.headers.get("retry-after");
          return json({ error: "Cloudflare image generation failed.", code: upstream.status === 401 || upstream.status === 403 ? "CLOUDFLARE_AUTH" : upstream.status === 429 ? "CLOUDFLARE_RATE_LIMIT" : upstream.status >= 500 ? "CLOUDFLARE_UPSTREAM" : "CLOUDFLARE_GENERATION_FAILED", detail: validBase64Image ? detail : detail + " (image payload missing, invalid, or oversized)", upstream_status: upstream.status, request_id: requestId }, responseStatus, retryAfter ? { "Retry-After": retryAfter } : {});
        }
        return json({ ok: true, engine: "Cloudflare Workers AI · FLUX.1 Schnell", image_data_url: "data:image/jpeg;base64," + image, request_id: requestId });
      } catch (error) {
        const detail = String(error instanceof Error ? error.message : error).slice(0, 300);
        console.error("fal-gateway Cloudflare network failure", { requestId, detail });
        return json({ error: "Cloudflare image request failed.", code: /abort|timeout/i.test(detail) ? "CLOUDFLARE_TIMEOUT" : "CLOUDFLARE_NETWORK", detail, request_id: requestId }, 502);
      }
    }
    if (action === "cloudflare-reference-background") {
      if (!cloudflareAccountId || !cloudflareToken) {
        return json({ error: "Cloudflare Workers AI is not configured.", code: "CLOUDFLARE_NOT_CONFIGURED", request_id: requestId }, 503);
      }
      const prompt = String(body.prompt || "").trim();
      const reference = String(body.reference_image || "");
      const match = reference.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
      if (prompt.length < 4 || prompt.length > 2048) {
        return json({ error: "Prompt must contain 4 to 2048 characters.", code: "INVALID_PROMPT", request_id: requestId }, 400);
      }
      if (!match || match[2].length > 1800000 || match[2].length % 4 !== 0) {
        return json({ error: "Reference image must be a valid, resized base64 image.", code: "INVALID_REFERENCE_IMAGE", request_id: requestId }, 400);
      }
      try {
        const binary = atob(match[2]);
        if (binary.length < 256 || binary.length > 1024 * 1024) {
          return json({ error: "Reference image size is outside the allowed range.", code: "REFERENCE_IMAGE_SIZE", request_id: requestId }, 413);
        }
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const form = new FormData();
        form.append("prompt", prompt);
        form.append("width", "1024");
        form.append("height", "576");
        form.append("input_image_0", new Blob([bytes], { type: "image/" + match[1].toLowerCase() }), "background-reference." + (match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase()));
        const upstream = await fetchWithTimeout(
          "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cloudflareAccountId) + "/ai/run/@cf/black-forest-labs/flux-2-klein-4b",
          { method: "POST", headers: { "Authorization": "Bearer " + cloudflareToken }, body: form },
          90000
        );
        const raw = await upstream.text();
        let payload: Record<string, unknown>;
        try { payload = raw ? JSON.parse(raw) : {}; }
        catch {
          return json({ error: "Cloudflare reference model returned invalid JSON.", code: "CLOUDFLARE_INVALID_RESPONSE", request_id: requestId }, 502);
        }
        const result = payload.result && typeof payload.result === "object" ? payload.result as Record<string, unknown> : {};
        const image = typeof result.image === "string" ? result.image.trim() : "";
        const validImage = image.length >= 1000 && image.length <= 16 * 1024 * 1024 && image.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(image);
        if (!upstream.ok || payload.success === false || !validImage) {
          const errors = Array.isArray(payload.errors) ? payload.errors : [];
          const detail = String((errors[0] as Record<string, unknown> | undefined)?.message || payload.message || upstream.statusText || "No valid image returned").slice(0, 400);
          const status = !upstream.ok ? (upstream.status >= 500 ? 502 : upstream.status) : 502;
          return json({
            error: "Cloudflare reference image generation failed.",
            code: upstream.status === 401 || upstream.status === 403 ? "CLOUDFLARE_AUTH" : upstream.status === 429 ? "CLOUDFLARE_RATE_LIMIT" : upstream.status >= 500 ? "CLOUDFLARE_UPSTREAM" : "CLOUDFLARE_REFERENCE_FAILED",
            detail: detail.slice(0, 400), upstream_status: upstream.status, request_id: requestId
          }, status, upstream.headers.get("retry-after") ? { "Retry-After": upstream.headers.get("retry-after")! } : {});
        }
        return json({ ok: true, engine: "Cloudflare Workers AI · FLUX.2 Klein 4B (reference guided)", image_data_url: "data:image/png;base64," + image, request_id: requestId });
      } catch (error) {
        const detail = String(error instanceof Error ? error.message : error).slice(0, 300);
        console.error("fal-gateway Cloudflare reference image failed", { requestId, detail });
        return json({ error: "Cloudflare reference image request failed.", code: /abort|timeout/i.test(detail) ? "CLOUDFLARE_TIMEOUT" : "CLOUDFLARE_NETWORK", detail, request_id: requestId }, 502);
      }
    }
    if (!falKey) return json({ error: "Optional FAL_KEY is not configured; the free animation path does not require it.", code: "OPTIONAL_PROVIDER_NOT_CONFIGURED", request_id: requestId }, 503);

    const task = String(body.task || "");
    const model = MODELS[task as keyof typeof MODELS];
    if (!model) return json({ error: "Unsupported task. Use image or video.", code: "UNSUPPORTED_TASK", request_id: requestId }, 400);

    const headers = { "Authorization": "Key " + falKey, "Content-Type": "application/json" };
    let upstream: Response;
    if (action === "submit") {
      const prompt = String(body.prompt || "").trim();
      if (prompt.length < 4 || prompt.length > 5000) return json({ error: "Prompt must contain 4 to 5000 characters.", code: "INVALID_PROMPT" }, 400);
      const input = task === "image"
        ? { prompt, image_size: "landscape_16_9", num_images: 1, output_format: "png", enable_safety_checker: true }
        : { prompt, resolution: "992x512", negative_prompt: "jitter, blur, flicker, distorted anatomy, unstable camera" };
      try {
        upstream = await fetchWithTimeout("https://queue.fal.run/" + model, { method: "POST", headers, body: JSON.stringify(input) }, 30000);
      } catch (error) {
        const detail = String(error instanceof Error ? error.message : error);
        console.error("fal-gateway upstream submit failed", { requestId, task, detail });
        return json({ error: "Provider network or timeout error.", code: /abort|timeout/i.test(detail) ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK", detail: detail.slice(0, 300), request_id: requestId }, 502);
      }
    } else if (action === "status" || action === "result") {
      const requestIdFromBody = String(body.request_id || "");
      if (!/^[A-Za-z0-9-]{8,128}$/.test(requestIdFromBody)) return json({ error: "Invalid request_id.", code: "INVALID_REQUEST_ID" }, 400);
      const suffix = action === "status" ? "/status" : "";
      try {
        upstream = await fetchWithTimeout("https://queue.fal.run/" + model + "/requests/" + encodeURIComponent(requestIdFromBody) + suffix, {
          method: "GET", headers: { "Authorization": "Key " + falKey }
        }, 20000);
      } catch (error) {
        const detail = String(error instanceof Error ? error.message : error);
        console.error("fal-gateway upstream lookup failed", { requestId, task, detail });
        return json({ error: "Provider network or timeout error.", code: /abort|timeout/i.test(detail) ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK", detail: detail.slice(0, 300), request_id: requestId }, 502);
      }
    } else {
      return json({ error: "Unsupported action. Use health, submit, status or result.", code: "UNSUPPORTED_ACTION" }, 400);
    }

    const raw = await upstream.text();
    let payload: Record<string, unknown>;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch {
      console.error("fal-gateway invalid provider JSON", { requestId, status: upstream.status, bodyPreview: raw.slice(0, 300) });
      return json({ error: "Provider returned invalid JSON.", code: "UPSTREAM_INVALID_JSON", request_id: requestId }, 502);
    }
    if (!upstream.ok) {
      const detail = String(payload.detail || payload.message || upstream.statusText).slice(0, 500);
      const code = classifyStatus(upstream.status);
      console.error("fal-gateway provider rejected request", { requestId, task, status: upstream.status, code, detail });
      return json({ error: "Provider request failed.", code, detail, upstream_status: upstream.status, request_id: requestId }, upstream.status >= 500 ? 502 : upstream.status);
    }
    return json({ task, model, ...payload, request_id: requestId }, action === "submit" ? 202 : 200);
  } catch (error) {
    const detail = String(error instanceof Error ? error.stack || error.message : error).slice(0, 900);
    console.error("fal-gateway unhandled exception", { requestId, detail });
    return json({ error: "Unexpected Edge Function error.", code: "EDGE_UNHANDLED", detail: detail.slice(0, 500), request_id: requestId }, 500);
  }
});