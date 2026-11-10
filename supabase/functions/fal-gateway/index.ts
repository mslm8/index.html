const ALLOWED_ORIGINS = new Set(["https://mslm8.github.io"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://mslm8.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
const MODELS = { image: Deno.env.get("FAL_IMAGE_MODEL") || "fal-ai/flux/dev", video: Deno.env.get("FAL_VIDEO_MODEL") || "bytedance/seedance-2.5/us/text-to-video", "image-to-video": Deno.env.get("FAL_I2V_MODEL") || "alibaba/wan-3.0-prime/image-to-video" };

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
    if (action === "health") {
      return json({
        ok: true,
        configured: Boolean(falKey),
        paidProviderOptional: true,
        imageModel: MODELS.image,
        videoModel: MODELS.video,
        imageToVideoModel: MODELS["image-to-video"],
        request_id: requestId
      });
    }
    if (action === "huggingface-image") {
      const hfToken = Deno.env.get("HF_TOKEN") || "";
      if (!hfToken) {
        return json({
          error: "Hugging Face is not configured yet. Add HF_TOKEN as a Supabase Edge Function secret.",
          code: "HUGGINGFACE_NOT_CONFIGURED",
          request_id: requestId
        }, 503);
      }
      const prompt = String(body.prompt || "").trim();
      if (prompt.length < 4 || prompt.length > 3000) {
        return json({ error: "Prompt must contain 4 to 3000 characters.", code: "INVALID_PROMPT", request_id: requestId }, 400);
      }
      try {
        const upstream = await fetchWithTimeout(
          "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev",
          {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + hfToken,
              "Content-Type": "application/json",
              "Accept": "image/png"
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: { width: 1024, height: 576, num_inference_steps: 25 }
            })
          },
          90000
        );
        const contentType = upstream.headers.get("content-type") || "";
        if (!upstream.ok || !contentType.startsWith("image/")) {
          const detail = (await upstream.text()).slice(0, 500);
          const status = upstream.status === 401 || upstream.status === 403 ? 502 :
            upstream.status === 429 ? 429 :
            upstream.status === 402 ? 402 :
            upstream.status >= 500 ? 502 : 502;
          return json({
            error: "Hugging Face image generation failed.",
            code: upstream.status === 401 || upstream.status === 403 ? "HUGGINGFACE_AUTH" :
              upstream.status === 402 ? "HUGGINGFACE_CREDITS_EXHAUSTED" :
              upstream.status === 429 ? "HUGGINGFACE_RATE_LIMIT" : "HUGGINGFACE_UPSTREAM",
            upstream_status: upstream.status,
            detail,
            request_id: requestId
          }, status);
        }
        const bytes = new Uint8Array(await upstream.arrayBuffer());
        if (bytes.length < 1000 || bytes.length > 12 * 1024 * 1024) {
          return json({ error: "Hugging Face returned an invalid image size.", code: "HUGGINGFACE_INVALID_IMAGE", request_id: requestId }, 502);
        }
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
        }
        const base64 = btoa(binary);
        return json({
          ok: true,
          engine: "Hugging Face Inference · FLUX.1-dev",
          image_data_url: "data:" + contentType + ";base64," + base64,
          request_id: requestId
        });
      } catch (error) {
        const detail = String(error instanceof Error ? error.message : error).slice(0, 300);
        return json({
          error: "Hugging Face request failed.",
          code: /abort|timeout/i.test(detail) ? "HUGGINGFACE_TIMEOUT" : "HUGGINGFACE_NETWORK",
          detail,
          request_id: requestId
        }, 502);
      }
    }
    if (!falKey) return json({ error: "Optional FAL_KEY is not configured; the free animation path does not require it.", code: "OPTIONAL_PROVIDER_NOT_CONFIGURED", request_id: requestId }, 503);

    const task = String(body.task || "");
    const model = MODELS[task as keyof typeof MODELS];
    if (!model) return json({ error: "Unsupported task. Use image, video or image-to-video.", code: "UNSUPPORTED_TASK", request_id: requestId }, 400);

    const headers = { "Authorization": "Key " + falKey, "Content-Type": "application/json" };
    let upstream: Response;
    if (action === "submit") {
      const prompt = String(body.prompt || "").trim();
      if (prompt.length < 4 || prompt.length > 5000) return json({ error: "Prompt must contain 4 to 5000 characters.", code: "INVALID_PROMPT" }, 400);
      let input: Record<string, unknown>;
      if (task === "image") {
        input = { prompt, image_size: "landscape_16_9", num_images: 1, output_format: "png", enable_safety_checker: true };
      } else if (task === "video") {
        const duration = String(body.duration || "5");
        if (!/^(4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30)$/.test(duration)) {
          return json({ error: "Video duration must be between 4 and 30 seconds.", code: "INVALID_DURATION", request_id: requestId }, 400);
        }
        const resolution = String(body.resolution || "720p");
        if (!["480p", "720p", "1080p"].includes(resolution)) {
          return json({ error: "Unsupported video resolution.", code: "INVALID_RESOLUTION", request_id: requestId }, 400);
        }
        const aspectRatio = String(body.aspect_ratio || "16:9");
        if (!["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(aspectRatio)) {
          return json({ error: "Unsupported aspect ratio.", code: "INVALID_ASPECT_RATIO", request_id: requestId }, 400);
        }
        input = { prompt, resolution, duration, aspect_ratio: aspectRatio, generate_audio: false, bitrate_mode: "standard", codec: "H264" };
      } else {
        const imageUrl = String(body.image_url || "").trim();
        if (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 4096) {
          return json({ error: "A public HTTPS image_url is required for image-to-video.", code: "INVALID_IMAGE_URL", request_id: requestId }, 400);
        }
        const duration = Number(body.duration || 5);
        if (!Number.isInteger(duration) || duration < 2 || duration > 30) {
          return json({ error: "Image-to-video duration must be 2 to 30 seconds.", code: "INVALID_DURATION", request_id: requestId }, 400);
        }
        const resolution = String(body.resolution || "720p");
        if (!["480p", "720p", "1080p"].includes(resolution)) {
          return json({ error: "Unsupported image-to-video resolution.", code: "INVALID_RESOLUTION", request_id: requestId }, 400);
        }
        input = { start_image_url: imageUrl, prompt, resolution, aspect_ratio: "16:9", duration, audio: false, enable_safety_checker: true };
      }
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