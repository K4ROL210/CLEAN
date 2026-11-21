// CLEAN QUEST – serwer pośredniczący AI (Cloudflare Worker).
// Aplikacja na GitHub Pages wysyła tu prompt i zdjęcia, a Worker woła API Claude z tajnym kluczem.
// Klucz NIGDY nie trafia do przeglądarki – jest sekretem Workera (ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";

const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 4_000_000; // ok. 3 MB na zdjęcie (aplikacja wysyła ~0,3 MB)
const MAX_PROMPT_CHARS = 20_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Modele z obsługą serwerowego „fallbacku” po odmowie (refusal) – ten sam request przejmuje inny model.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1"]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/") return reply(200, { ok: true, app: "clean-quest-ai" });
    if (!okOrigin) return reply(403, { code: "forbidden_origin" });
    if (request.method !== "POST" || path !== "/ask") return reply(404, { code: "not_found" });

    // Limit zapytań na adres IP (ochrona przed nadużyciem i kosztami).
    if (env.LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return reply(429, { code: "rate_limited" });
    }

    let body;
    try { body = await request.json(); } catch { return reply(400, { code: "invalid_request" }); }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const images = Array.isArray(body.images) ? body.images : [];
    const tier = body.tier === "quick" ? "quick" : "default";
    const badImage = images.some((i) => !i || typeof i.data !== "string" || i.data.length > MAX_IMAGE_B64 || !IMAGE_TYPES.has(i.type));
    if (!prompt || prompt.length > MAX_PROMPT_CHARS || images.length > MAX_IMAGES || badImage) {
      return reply(400, { code: badImage ? "image_rejected" : "invalid_request" });
    }

    const model = tier === "quick" ? (env.MODEL_QUICK || "claude-haiku-5-5") : (env.MODEL_DEFAULT || "claude-opus-5-5");
    const params = {
      model,
      max_tokens: 16000,
      output_config: { effort: tier === "quick" ? "low" : "medium" },
      messages: [{
        role: "user",
        content: [
          ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } })),
          { type: "text", text: prompt },
        ],
      }],
    };

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const res = FALLBACK_MODELS.has(model)
        ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.messages.create(params);
      if (res.stop_reason === "refusal") return reply(422, { code: "refused" });
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      if (!text.trim()) return reply(502, { code: "empty_completion" });
      return reply(200, { text });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return reply(429, { code: "rate_limited" });
      if (e instanceof Anthropic.AuthenticationError) return reply(500, { code: "server_misconfigured" });
      if (e instanceof Anthropic.BadRequestError) return reply(400, { code: "upstream_bad_request" });
      if (e instanceof Anthropic.APIError) return reply(502, { code: "upstream_error" });
      return reply(500, { code: "upstream_error" });
    }
  },
};
