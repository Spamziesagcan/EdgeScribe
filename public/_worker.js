// _worker.js - For Cloudflare Pages Full-Stack Deployment (FINAL VERSION WITH NER)

// =================================================================================
// HELPER FUNCTIONS AND CONFIGURATION
// =================================================================================
const SUPPORTED_LANGUAGES = [ "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "tr", "el", "he", "th", "vi", "id", "ms", "tl", "sw", "am", "eu", "be", "bg", "bn", "hr" ];
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
// MAIN FETCH HANDLER
// =================================================================================
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    // Only treat POST requests to the root, and health/debug paths as API requests.
    const isApiRequest = (request.method === 'POST' && url.pathname === '/') || url.pathname.startsWith('/health') || url.pathname.startsWith('/debug');

    if (!isApiRequest) {
      // This is a request for a static asset (like index.html, css, or js files).
      // We pass the request to the Pages static asset server to handle.
      return env.ASSETS.fetch(request);
    }

    // --- From here on, it's the API request logic ---
    try {
      if (request.method === "OPTIONS") return handleOptions();
      if (url.pathname === "/health") return handleHealthCheck();
      
      const clientIP = getClientIP(request);

      if (url.pathname === "/debug") {
        return new Response(JSON.stringify({
            kv_bound: !!env.EDGESCRIBE_CACHE, ai_bound: !!env.AI, config: CONFIG,
          }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }

      if (request.method === "POST" && url.pathname === "/") {
        checkRateLimit(clientIP);

        const contentType = request.headers.get("Content-Type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new ValidationError("Content-Type must be application/json");
        }
        
        const { text, targetLang } = await request.json();
        validateInput(text, targetLang);

        // --- NEW TRANSLATION LOGIC WITH NER STARTS HERE ---

        // 1. First, perform the summarization as before
        const summaryResponse = await env.AI.run("@cf/facebook/bart-large-cnn", { input_text: text });
        const summaryText = summaryResponse?.summary;
        if (!summaryText) {
          throw new AIServiceError("Summarization failed to produce a valid response.");
        }

        // 2. Use a NER model to find names of people in the summary
        const nerResponse = await env.AI.run("@cf/dslim/bert-base-ner", { text: summaryText });
        
        // Filter for only 'Person' entities and get the actual name
        const namesToProtect = nerResponse
            .filter(entity => entity.entity_group === 'PER')
            .map(entity => entity.word);
        
        // Create a unique list of names to avoid repetition in the prompt
        const uniqueNames = [...new Set(namesToProtect)];

        // 3. Construct a new, more powerful prompt for the translation model
        let translationPrompt = summaryText; // Start with the summary text
        
        if (uniqueNames.length > 0) {
            // If we found names, add a special instruction to the prompt
            const namesList = uniqueNames.join(", ");
            // This is the "prompt engineering" part
            translationPrompt = `Translate the following text to ${targetLang}. The following words are proper names and must not be translated: ${namesList}. Text to translate: "${summaryText}"`;
        }

        // 4. Translate using the new, engineered prompt
        const translationResponse = await env.AI.run("@cf/meta/m2m100-1.2b", {
            text: translationPrompt, // Use our new, smarter prompt
            source_lang: "en",
            target_lang: targetLang
        });
        
        let translatedText = translationResponse?.translated_text;
        if (!translatedText) {
            throw new AIServiceError("Translation failed: invalid response from AI.");
        }

        // Optional but recommended: Clean up the model's output if it includes our instructions
        if (translatedText.startsWith('"') && translatedText.endsWith('"')) {
            translatedText = translatedText.slice(1, -1);
        }
        
        // --- NEW TRANSLATION LOGIC ENDS HERE ---

        const result = JSON.stringify({
          summary: summaryText,
          translated: translatedText,
          target_language: targetLang,
          timestamp: new Date().toISOString(),
        });

        // Use the original user text for a consistent cache key
        const cacheKey = sanitizeCacheKey(targetLang, text);
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