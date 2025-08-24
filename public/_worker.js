// _worker.js - For Cloudflare Pages Full-Stack Deployment (CORRECTED)

// =================================================================================
// HELPER FUNCTIONS AND CONFIGURATION (No changes needed here)
// =================================================================================

// ... (all your other functions like SUPPORTED_LANGUAGES, CONFIG, ValidationError, etc. are here - no changes)
const SUPPORTED_LANGUAGES = [
  "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh",
  "ar", "hi", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu",
  "ro", "tr", "el", "he", "th", "vi", "id", "ms", "tl", "sw",
  "am", "eu", "be", "bg", "bn", "hr",
];
const CONFIG = { MAX_TEXT_LENGTH: 5000, CACHE_TTL: 3600, AI_TIMEOUT: 30000, RATE_LIMIT_PER_IP: 60 };
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" };
class ValidationError extends Error { constructor(message) { super(message); this.name = "ValidationError"; } }
class RateLimitError extends Error { constructor(message) { super(message); this.name = "RateLimitError"; } }
class AIServiceError extends Error { constructor(message) { super(message); this.name = "AIServiceError"; } }
function validateInput(text, targetLang) { if (!text || typeof text !== "string" || text.trim().length === 0) { throw new ValidationError("Text parameter is required and cannot be empty"); } if (text.length > CONFIG.MAX_TEXT_LENGTH) { throw new ValidationError(`Text exceeds maximum length of ${CONFIG.MAX_TEXT_LENGTH} characters`); } if (!targetLang || typeof targetLang !== "string") { throw new ValidationError("Target language parameter is required and must be a string"); } if (!SUPPORTED_LANGUAGES.includes(targetLang)) { throw new ValidationError(`Unsupported target language: ${targetLang}.`); } }
function hashString(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = (hash << 5) - hash + char; hash |= 0; } return Math.abs(hash).toString(36); }
function sanitizeCacheKey(targetLang, text) { const textHash = hashString(text.substring(0, 100)); return `translate:${targetLang}:${textHash}`; }
const rateLimitStore = new Map();
function checkRateLimit(ip) { const now = Date.now(); const windowStart = now - 60000; if (!rateLimitStore.has(ip)) { rateLimitStore.set(ip, []); } const requests = rateLimitStore.get(ip); const recentRequests = requests.filter((time) => time > windowStart); if (recentRequests.length >= CONFIG.RATE_LIMIT_PER_IP) { throw new RateLimitError("Rate limit exceeded. Please try again later."); } recentRequests.push(now); rateLimitStore.set(ip, recentRequests); }
function getClientIP(request) { return request.headers.get("CF-Connecting-IP") || "127.0.0.1"; }
function handleOptions() { return new Response(null, { status: 204, headers: CORS_HEADERS }); }
function handleHealthCheck() { return new Response( JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } } ); }


// =================================================================================
// MAIN FETCH HANDLER (MODIFIED FOR CLOUDFLARE PAGES)
// =================================================================================

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    // This is the key change. We now only intercept POST requests to the root.
    const isApiRequest = (request.method === 'POST' && url.pathname === '/') || url.pathname.startsWith('/health') || url.pathname.startsWith('/debug');

    if (!isApiRequest) {
      // This is not an API request, so we pass it to the next function
      // which is Cloudflare Pages' static asset server. This will serve your main_page.html.
      return context.next();
    }

    // --- From here on, it's your original worker logic for API requests ---
    try {
      if (request.method === "OPTIONS") return handleOptions();
      if (url.pathname === "/health") return handleHealthCheck();
      
      const clientIP = getClientIP(request);

      if (url.pathname === "/debug") {
        return new Response(JSON.stringify({
            kv_bound: !!env.EDGESCRIBE_CACHE, ai_bound: !!env.AI, config: CONFIG,
          }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }

      // This GET handler is no longer reachable on the root path, which is correct.
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(JSON.stringify({ service: "EdgeScribe API is active" }),
          { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }

      if (request.method === "POST" && url.pathname === "/") {
        checkRateLimit(clientIP);

        const contentType = request.headers.get("Content-Type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new ValidationError("Content-Type must be application/json");
        }
        
        const { text, targetLang } = await request.json();
        validateInput(text, targetLang);

        const cacheKey = sanitizeCacheKey(targetLang, text);
        if (env.EDGESCRIBE_CACHE) {
            const cached = await env.EDGESCRIBE_CACHE.get(cacheKey);
            if (cached) {
                return new Response(cached, { headers: { "Content-Type": "application/json", "X-Cache-Status": "HIT", ...CORS_HEADERS } });
            }
        }

        const summaryResponse = await env.AI.run("@cf/facebook/bart-large-cnn", { input_text: text });
        const summaryText = summaryResponse?.summary;
        if (!summaryText) {
          throw new AIServiceError("Summarization failed to produce a valid response.");
        }

        const translationResponse = await env.AI.run("@cf/meta/m2m100-1.2b", { text: summaryText, source_lang: "en", target_lang: targetLang });
        const translatedText = translationResponse?.translated_text;
        if (!translatedText) {
          throw new AIServiceError("Translation failed to produce a valid response.");
        }

        const result = JSON.stringify({
          summary: summaryText,
          translated: translatedText,
          target_language: targetLang,
          timestamp: new Date().toISOString(),
        });

        if (env.EDGESCRIBE_CACHE) {
          context.waitUntil(env.EDGESCRIBE_CACHE.put(cacheKey, result, { expirationTtl: CONFIG.CACHE_TTL }));
        }

        return new Response(result, { headers: { "Content-Type": "application/json", "X-Cache-Status": "MISS", ...CORS_HEADERS } });
      }

      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });

    } catch (err) {
      console.error("Request error:", err);
      let status = 500;
      let errorResponse = { error: "Internal Server Error" };

      if (err instanceof ValidationError) { status = 400; errorResponse = { error: err.message }; }
      else if (err instanceof RateLimitError) { status = 429; errorResponse = { error: err.message }; }
      else if (err instanceof AIServiceError) { status = 503; errorResponse = { error: err.message }; }

      return new Response(JSON.stringify(errorResponse), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  },
};