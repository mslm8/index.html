const MODEL_CANDIDATES = [
  "@cf/bytedance/stable-diffusion-xl-lightning",
  "@cf/lykon/dreamshaper-8-lcm",
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/black-forest-labs/flux-2-klein-9b"
];

function errorText(error) {
  return String(error && error.message ? error.message : error).slice(0, 700);
}

function isModelAccessError(message) {
  return /model.{0,40}(not allowed|not available|invalid|unsupported)|not allowed.{0,40}model|does not have access/i.test(message);
}

async function imagePayload(result) {
  if (result && typeof result.image === "string") {
    return { bytes: Uint8Array.from(atob(result.image), c => c.charCodeAt(0)), contentType: "image/jpeg" };
  }
  if (result && Array.isArray(result.images) && typeof result.images[0] === "string") {
    return { bytes: Uint8Array.from(atob(result.images[0]), c => c.charCodeAt(0)), contentType: "image/png" };
  }
  if (result instanceof ReadableStream) {
    const bytes = new Uint8Array(await new Response(result).arrayBuffer());
    return { bytes, contentType: "image/png" };
  }
  if (result instanceof Response) {
    const type = result.headers.get("content-type") || "image/png";
    return { bytes: new Uint8Array(await result.arrayBuffer()), contentType: type };
  }
  throw new Error("Model returned an unsupported image response format");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed === "*" ? "*" : (origin === allowed ? origin : "null"),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      if (allowed && allowed !== "*" && origin !== allowed) return new Response("Origin not allowed", { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({
        ok: true,
        service: "AI Animator image engine",
        engine: "Cloudflare Workers AI",
        strategy: "ordered-model-fallback",
        modelCandidates: MODEL_CANDIDATES
      }, { headers: cors });
    }
    if (url.pathname !== "/generate" || request.method !== "POST") {
      return Response.json({ error: "Not found" }, { status: 404, headers: cors });
    }
    if (allowed && allowed !== "*" && origin !== allowed) {
      return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors });
    }
    if (!env.AI) {
      return Response.json({ error: "Cloudflare AI binding is missing. Add an AI binding named AI to this Worker." }, { status: 503, headers: cors });
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 12000) throw new Error("Request too large");
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid or oversized JSON" }, { status: 400, headers: cors });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 4 || prompt.length > 2000) {
      return Response.json({ error: "Prompt must be 4–2000 characters" }, { status: 400, headers: cors });
    }

    const failures = [];
    for (const model of MODEL_CANDIDATES) {
      try {
        const input = { prompt, width: 1024, height: 576 };
        if (model.includes("stable-diffusion") || model.includes("dreamshaper")) input.num_steps = 4;
        else input.steps = 4;
        const result = await env.AI.run(model, input);
        const output = await imagePayload(result);
        if (!output.bytes || output.bytes.length < 1000 || output.bytes.length > 12 * 1024 * 1024) {
          throw new Error("Model returned an empty or oversized image");
        }
        return new Response(output.bytes, {
          headers: {
            ...cors,
            "Content-Type": output.contentType.startsWith("image/") ? output.contentType : "image/png",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-AI-Model": model
          }
        });
      } catch (error) {
        const detail = errorText(error);
        failures.push({ model, detail });
        // Only rotate models when access/model compatibility is the issue.
        // Quota, billing, timeout and upstream failures are surfaced immediately.
        if (!isModelAccessError(detail)) {
          const status = /quota|allocation|billing|payment/i.test(detail) ? 402 :
            /rate.?limit|too many/i.test(detail) ? 429 : 502;
          return Response.json({
            error: "Image model request failed",
            code: status === 402 ? "MODEL_QUOTA_OR_BILLING" : status === 429 ? "MODEL_RATE_LIMIT" : "MODEL_UPSTREAM_ERROR",
            model,
            detail
          }, { status, headers: cors });
        }
      }
    }

    return Response.json({
      error: "No configured Cloudflare image model is allowed for this account.",
      code: "NO_ALLOWED_IMAGE_MODEL",
      attemptedModels: failures.map(item => item.model),
      details: failures.map(item => item.detail)
    }, { status: 503, headers: cors });
  }
};
