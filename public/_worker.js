// _worker.js - For Cloudflare Pages Full-Stack Deployment (DEFINITIVE - TRANSLATE-IN-PARTS METHOD)

// =================================================================================
// HELPER FUNCTIONS AND CONFIGURATION
// =================================================================================
const SUPPORTED_LANGUAGES = [ "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "tr", "el", "he", "th", "vi", "id", "ms", "tl", "sw", "am", "eu", "be", "bg", "bn", "hr" ];
const CONFIG = { MAX_TEXT_LENGTH: 5000, CACHE_TTL: 3600, AI_TIMEOUT: 30000, RATE_LIMIT_PER_IP: 60 };
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" };
class ValidationError extends Error { constructor(message) { super(message); this.name = "ValidationError"; } }
class RateLimitError extends Error { constructor(message) { super(message); this.name = "RateLimitError"; } }
class AIServiceError extends Error { constructor(message) { super(message); this.name = "AIServiceError"; } }
function validateInput(text, sourceLang, targetLang) { if (!text || typeof text !== "string" || text.trim().length === 0) { throw new ValidationError("Text parameter is required and cannot be empty"); } if (text.length > CONFIG.MAX_TEXT_LENGTH) { throw new ValidationError(`Text exceeds maximum length of ${CONFIG.MAX_TEXT_LENGTH} characters`); } if (!sourceLang || typeof sourceLang !== "string" || !SUPPORTED_LANGUAGES.includes(sourceLang)) { throw new ValidationError(`Invalid source language provided.`); } if (!targetLang || typeof targetLang !== "string" || !SUPPORTED_LANGUAGES.includes(targetLang)) { throw new ValidationError(`Invalid target language provided.`); } }
function hashString(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = (hash << 5) - hash + char; hash |= 0; } return Math.abs(hash).toString(36); }
function sanitizeCacheKey(sourceLang, targetLang, text) { const textHash = hashString(text.substring(0, 100)); return `translate:${sourceLang}:${targetLang}:${textHash}`; }
const rateLimitStore = new Map();
function checkRateLimit(ip) { const now = Date.now(); const windowStart = now - 60000; if (!rateLimitStore.has(ip)) { rateLimitStore.set(ip, []); } const requests = rateLimitStore.get(ip); const recentRequests = requests.filter((time) => time > windowStart); if (recentRequests.length >= CONFIG.RATE_LIMIT_PER_IP) { throw new RateLimitError("Rate limit exceeded. Please try again later."); } recentRequests.push(now); rateLimitStore.set(ip, recentRequests); }
function getClientIP(request) { return request.headers.get("CF-Connecting-IP") || "127.0.0.1"; }
function handleOptions() { return new Response(null, { status: 204, headers: CORS_HEADERS }); }
function handleHealthCheck() { return new Response( JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } } ); }

// =================================================================================
// MAIN FETCH HANDLER
// =================================================================================
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const isApiRequest = (request.method === 'POST' && url.pathname === '/') || url.pathname.startsWith('/health') || url.pathname.startsWith('/debug');
    if (!isApiRequest) { return env.ASSETS.fetch(request); }

    try {
      if (request.method === "OPTIONS") return handleOptions();
      if (url.pathname === "/health") return handleHealthCheck();
      
      const clientIP = getClientIP(request);

      if (url.pathname === "/debug") { return new Response(JSON.stringify({ kv_bound: !!env.EDGESCRIBE_CACHE, ai_bound: !!env.AI, config: CONFIG, }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }); }

      if (request.method === "POST" && url.pathname === "/") {
        checkRateLimit(clientIP);

        const contentType = request.headers.get("Content-Type");
        if (!contentType || !contentType.includes("application/json")) { throw new ValidationError("Content-Type must be application/json"); }
        
        const { text, sourceLang, targetLang } = await request.json();
        validateInput(text, sourceLang, targetLang);

        let englishText = text;
        if (sourceLang !== 'en') {
            const toEnglishResponse = await env.AI.run("@cf/meta/m2m100-1.2b", { text: text, source_lang: sourceLang, target_lang: 'en' });
            if (!toEnglishResponse?.translated_text) { throw new AIServiceError("Failed to translate source text to English."); }
            englishText = toEnglishResponse.translated_text;
        }

        const summaryResponse = await env.AI.run("@cf/facebook/bart-large-cnn", { input_text: englishText });
        const summaryText = summaryResponse?.summary;
        if (!summaryText) { throw new AIServiceError("Summarization failed to produce a valid response."); }

        // --- DEFINITIVE "TRANSLATE-IN-PARTS" METHOD ---
        
        let translatedText = summaryText;
        if (targetLang !== 'en') {
            const PROTECTED_WORDS = [ 'Harsh', 'Rocky', 'Lucky', 'Honey', 'Deep', 'Rose', 'Sunny', 'Jasmine', 'Crystal', 'Bill', 'Frank', 'Mark', 'Amber', 'Brandy', 'Brooks', 'Clay', 'Cliff', 'Dean', 'Drew', 'Duke', 'Forrest', 'Grant', 'Hunter', 'Lance', 'Miles', 'Reed', 'Rob', 'Roman', 'Rusty', 'Sky', 'Stone', 'Wade', 'Woody', 'Blaze', 'Chase', 'Chip', 'Colt', 'Dash', 'Jett', 'Link', 'Cash', 'King', 'Legend', 'Major', 'Reign', 'Royal', 'Saint', 'Wilder', 'Zen', 'Angel', 'Blue', 'Cricket', 'Destiny', 'Faith', 'Grace', 'Harmony', 'Haven', 'Heaven', 'Honor', 'Hope', 'Journey', 'Joy', 'Justice', 'Liberty', 'Melody', 'Mercy', 'Patience', 'Peace', 'Precious', 'Serenity', 'Trinity', 'True', 'Wisdom', 'Winter', 'August', 'Christian', 'Genesis', 'Noel', 'Paris', 'Reagan', 'Zion', 'Boat', 'Apple', 'Amazon', 'Google', 'Microsoft' ];
            // This regex splits the string but KEEPS the delimiters (the names) in the resulting array.
            const protectedWordsRegex = new RegExp(`(${PROTECTED_WORDS.join('|')})`, 'gi');
            const fragments = summaryText.split(protectedWordsRegex);

            const translationPromises = fragments.map(async (fragment) => {
                // Check if the fragment is a protected word (case-insensitive check)
                if (fragment && PROTECTED_WORDS.some(word => word.toLowerCase() === fragment.toLowerCase())) {
                    return fragment; // It's a protected name, return it as is.
                }
                if (!fragment || fragment.trim() === '') {
                    return fragment; // It's an empty string, return it as is.
                }
                // It's a normal text fragment, translate it.
                const resp = await env.AI.run("@cf/meta/m2m100-1.2b", {
                    text: fragment,
                    source_lang: "en",
                    target_lang: targetLang
                });
                return resp.translated_text || fragment; // Fallback to original on error
            });

            const translatedFragments = await Promise.all(translationPromises);
            translatedText = translatedFragments.join(""); // Stitch the results back together.
        }

        const result = JSON.stringify({
          summary: summaryText,
          translated: translatedText,
          target_language: targetLang,
        });

        const cacheKey = sanitizeCacheKey(sourceLang, targetLang, text);
        if (env.EDGESCRIBE_CACHE) {
          context.waitUntil(env.EDGESCRIBE_CACHE.put(cacheKey, result, { expirationTtl: CONFIG.CACHE_TTL }));
        }

        return new Response(result, { headers: { "Content-Type": "application/json", "X-Cache-Status": "MISS", ...CORS_HEADERS } });
      }

      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: CORS_HEADERS });

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