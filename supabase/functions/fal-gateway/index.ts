const ALLOWED_ORIGIN = "https://mslm8.github.io";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};

const MODELS = {
  image: "fal-ai/flux/dev",
  video: "fal-ai/ovi"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const falKey = Deno.env.get("FAL_KEY");
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const action = String(body.action || "");
  if (action === "health") {
    return json({ configured: Boolean(falKey), imageModel: MODELS.image, videoModel: MODELS.video });
  }
  if (!falKey) return json({ error: "FAL_KEY is not configured in Supabase Edge Function Secrets." }, 503);

  const task = String(body.task || "");
  const model = MODELS[task as keyof typeof MODELS];
  if (!model) return json({ error: "Unsupported task. Use image or video." }, 400);

  const headers = { "Authorization": "Key " + falKey, "Content-Type": "application/json" };

  if (action === "submit") {
    const prompt = String(body.prompt || "").trim();
    if (prompt.length < 4 || prompt.length > 5000) return json({ error: "Prompt must contain 4 to 5000 characters." }, 400);

    const input = task === "image"
      ? {
          prompt,
          image_size: "landscape_16_9",
          num_images: 1,
          output_format: "png",
          enable_safety_checker: true
        }
      : {
          prompt,
          resolution: "992x512",
          negative_prompt: "jitter, blur, flicker, distorted anatomy, unstable camera"
        };

    const upstream = await fetch("https://queue.fal.run/" + model, {
      method: "POST",
      headers,
      body: JSON.stringify(input)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json({ error: "fal request submission failed.", detail: String(payload.detail || payload.message || upstream.statusText).slice(0, 500) }, upstream.status);
    }
    return json({ task, model, ...payload }, 202);
  }

  if (action === "status" || action === "result") {
    const requestId = String(body.request_id || "");
    if (!/^[A-Za-z0-9-]{8,128}$/.test(requestId)) return json({ error: "Invalid request_id." }, 400);
    const suffix = action === "status" ? "/status" : "";
    const upstream = await fetch("https://queue.fal.run/" + model + "/requests/" + encodeURIComponent(requestId) + suffix, {
      method: "GET",
      headers: { "Authorization": "Key " + falKey }
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json({ error: "fal request lookup failed.", detail: String(payload.detail || payload.message || upstream.statusText).slice(0, 500) }, upstream.status);
    }
    return json({ task, model, ...payload });
  }

  return json({ error: "Unsupported action. Use health, submit, status or result." }, 400);
});
