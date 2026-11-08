const MODEL = "@cf/black-forest-labs/flux-1-schnell";

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
      if (allowed && allowed !== "*" && origin !== allowed) {
        return new Response("Origin not allowed", { status: 403 });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json(
        { ok: true, service: "AI Animator image proxy", engine: "Cloudflare Workers AI", model: MODEL },
        { headers: cors }
      );
    }

    if (url.pathname !== "/generate" || request.method !== "POST") {
      return Response.json({ error: "Not found" }, { status: 404, headers: cors });
    }

    if (allowed && allowed !== "*" && origin !== allowed) {
      return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors });
    }

    if (!env.AI) {
      return Response.json(
        { error: "Cloudflare AI binding is missing. Add an AI binding named AI to this Worker." },
        { status: 503, headers: cors }
      );
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
    if (!prompt || prompt.length > 2000) {
      return Response.json({ error: "Prompt must be 1–2000 characters" }, { status: 400, headers: cors });
    }

    try {
      const result = await env.AI.run(MODEL, {
        prompt,
        steps: 4
      });

      if (!result || typeof result.image !== "string") {
        return Response.json({ error: "Cloudflare AI returned no image" }, { status: 502, headers: cors });
      }

      const binary = atob(result.image);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      return new Response(bytes, {
        headers: {
          ...cors,
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error).slice(0, 700);
      return Response.json(
        { error: "Cloudflare image generation failed", detail: message },
        { status: 502, headers: cors }
      );
    }
  }
};
