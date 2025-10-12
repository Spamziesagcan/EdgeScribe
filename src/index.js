import { CONFIG, CORS_HEADERS } from './config.js';
import { ValidationError, RateLimitError, AIServiceError } from './errors.js';
import { summarizeWithLlama, translateWithProtectedWords } from './ai.js';
import { validateInput, sanitizeCacheKey, checkRateLimit, getClientIP, handleOptions, handleHealthCheck, deduplicateSummary } from './utils.js';

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    // For Pages, we only handle specific API routes; the rest is handled by ASSETS
    const isApiRequest = (
  (request.method === 'POST' && url.pathname.startsWith('/api/')) || // <-- CHANGE THIS
  url.pathname.startsWith('/health') || 
  url.pathname.startsWith('/debug')
);
    
    // THIS IS THE CRITICAL PART
    if (!isApiRequest) {
      // If the request is NOT a POST to '/', it gets passed to the static asset server
      return env.ASSETS.fetch(request); 
    }

    // Handle pre-flight and health check requests
    if (request.method === "OPTIONS") return handleOptions();
    if (url.pathname === "/health") return handleHealthCheck();

    try {
      if (request.method === "POST" && url.pathname === "/api/summarize") {
        const clientIP = getClientIP(request);
        checkRateLimit(clientIP);

        if (!request.headers.get("Content-Type")?.includes("application/json")) {
          throw new ValidationError("Content-Type must be application/json");
        }

        const { text, sourceLang, targetLang } = await request.json();
        validateInput(text, sourceLang, targetLang);

        // Step 1: Translate to English if needed (as a base for summarization)
        let englishText = text;
        if (sourceLang !== 'en') {
          const toEnglishResponse = await env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: sourceLang, target_lang: "en" });
          englishText = toEnglishResponse?.translated_text;
          if (!englishText) throw new AIServiceError("Translation to English failed.");
        }

        // Step 2: Generate a high-quality summary from the English text
        let summaryText = await summarizeWithLlama(englishText, env);
        summaryText = deduplicateSummary(summaryText);

        // Step 3: Translate the final summary to the target language
        let translatedText = summaryText;
        if (targetLang !== 'en') {
          translatedText = await translateWithProtectedWords(summaryText, targetLang, env);
        }

        const result = JSON.stringify({ summary: summaryText, translated: translatedText, target_language: targetLang });

        // Step 4: Cache the result
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
