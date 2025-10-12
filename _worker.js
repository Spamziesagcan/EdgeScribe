// _worker.js - Single-File Deployment with Easy Model Swapping

// =================================================================================
// CHOOSE YOUR MODEL HERE
// =================================================================================

// INSTRUCTIONS: To test a new model, replace the string below with one of the other options.
//
// Top Options:
//   - '@cf/meta/llama-3-8b-instruct'  (Default, State-of-the-art)
//   - '@cf/mistral/mistral-7b-instruct-v0.1' (Fast and high-quality)
//   - '@cf/google/gemma-7b-it' (Solid all-rounder)
//   - '@cf/facebook/bart-large-cnn' (The old baseline for comparison)
//
const MODEL_TO_TEST = '@cf/mistral/mistral-7b-instruct-v0.1';


// =================================================================================
// CONFIGURATION AND HELPERS
// =================================================================================

const SUPPORTED_LANGUAGES = [ "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "tr", "el", "he", "th", "vi", "id", "ms", "tl", "sw", "am", "eu", "be", "bg", "bn", "hr", "ca" ];
const CONFIG = { MAX_TEXT_LENGTH: 5000, CACHE_TTL: 3600, RATE_LIMIT_PER_IP: 60 };
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" };

class ValidationError extends Error { constructor(message) { super(message); this.name = "ValidationError"; } }
class RateLimitError extends Error { constructor(message) { super(message); this.name = "RateLimitError"; } }
class AIServiceError extends Error { constructor(message) { super(message); this.name = "AIServiceError"; } }

// ... (All your other helper functions like validateInput, hashString, checkRateLimit, etc. go here)
// ... (I'm omitting them for brevity, but you should keep them in your file)
function validateInput(text, sourceLang, targetLang) { if (!text || typeof text !== "string" || text.trim().length === 0) throw new ValidationError("Text parameter is required and cannot be empty"); if (text.length > CONFIG.MAX_TEXT_LENGTH) throw new ValidationError(`Text exceeds maximum length of ${CONFIG.MAX_TEXT_LENGTH} characters`); if (!sourceLang || !SUPPORTED_LANGUAGES.includes(sourceLang)) throw new ValidationError(`Invalid source language provided.`); if (!targetLang || !SUPPORTED_LANGUAGES.includes(targetLang)) throw new ValidationError(`Invalid target language provided.`); }
function hashString(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = (hash << 5) - hash + char; hash |= 0; } return Math.abs(hash).toString(36); }
function sanitizeCacheKey(sourceLang, targetLang, text) { const textHash = hashString(text.substring(0, 100)); return `translate:${sourceLang}:${targetLang}:${textHash}`; }
const rateLimitStore = new Map();
function checkRateLimit(ip) { const now = Date.now(); const requests = rateLimitStore.get(ip) || []; const recentRequests = requests.filter((time) => time > (now - 60000)); if (recentRequests.length >= CONFIG.RATE_LIMIT_PER_IP) { throw new RateLimitError("Rate limit exceeded. Please try again later."); } recentRequests.push(now); rateLimitStore.set(ip, recentRequests); }
function getClientIP(request) { return request.headers.get("CF-Connecting-IP") || "127.0.0.1"; }
function deduplicateSummary(summaryText) { const sentences = summaryText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean); const uniqueSentences = []; const seen = new Set(); sentences.forEach(sentence => { const normalized = sentence.toLowerCase(); if (!seen.has(normalized)) { uniqueSentences.push(sentence); } }); return uniqueSentences.join('. ') + (uniqueSentences.length ? '.' : ''); }

function cleanSummaryPreamble(responseText) {
    // Splits the text by the first double newline.
    // Models often use this to separate the preamble from the main content.
    const parts = responseText.split('\n\n');

    if (parts.length > 1) {
        // If there's a preamble on the first line, the actual summary is likely the second part.
        // We check its length to avoid returning a tiny leftover piece.
        if (parts[1].length > parts[0].length) {
            return parts[1].trim();
        }
    }

    // A simpler check for a single-line preamble.
    const lines = responseText.split('\n');
    if (lines.length > 1 && lines[0].toLowerCase().startsWith("here is")) {
        // If the first line starts with a common preamble phrase, remove it.
        return lines.slice(1).join('\n').trim();
    }
    
    // If no preamble is detected, return the original text.
    return responseText.trim();
}


// =================================================================================
// AI FUNCTIONS
// =================================================================================

/**
 * NEW: Generates a summary using the model specified in MODEL_TO_TEST.
 * It automatically handles the different input/output formats for each model.
 */
async function generateSummary(text, env, modelId) {
  console.log(`Generating summary with model: ${modelId}`);

  let payload;
  let summary = "";

  // A detailed prompt for modern instruction-following models
  const instructionPrompt = `
Summarize the following text in a clear and concise manner, capturing all essential points and conclusions.

IMPORTANT: Your response must start directly with the first sentence of the summary. Do not include any introductory phrases like "Here is a summary:".

Here is the text:
---
${text}
---
Summary:`;

  // Prepare the correct payload based on the model
  if (modelId === '@cf/facebook/bart-large-cnn') {
    payload = { input_text: text, max_length: 350 };
  } else {
    // For Llama, Mistral, Gemma, etc.
    payload = { prompt: instructionPrompt, max_tokens: 350 };
  }

  try {
    const aiResponse = await env.AI.run(modelId, payload);

    // Extract the response from the correct property based on the model
    if (modelId === '@cf/facebook/bart-large-cnn') {
        summary = aiResponse.summary?.trim() || "";
    } else {
        summary = aiResponse.response?.trim() || "";
    }
    
    if (summary.length === 0) {
      console.error(`Model (${modelId}) returned an empty summary.`);
      return text.split(/[.!?]+/).slice(0, 3).join('. ').trim() + '.'; // Fallback
    }
    return cleanSummaryPreamble(summary);

  } catch (err) {
    console.error(`Error calling model (${modelId}):`, err);
    throw new AIServiceError("The AI summarization service failed.");
  }
}

/**
 * Translates text while ensuring certain words are not translated.
 */
async function translateWithProtectedWords(text, targetLang, env) {
  // ... (Your full translateWithProtectedWords function goes here, no changes needed)
  const PROTECTED_WORDS = [ 'Harsh', 'Rocky', 'Lucky', 'Honey', 'Deep', 'Rose', 'Sunny', 'Jasmine', 'Crystal', 'Bill', 'Frank', 'Mark', 'Amber', 'Brandy', 'Brooks', 'Clay', 'Cliff', 'Dean', 'Drew', 'Duke', 'Forrest', 'Grant', 'Hunter', 'Lance', 'Miles', 'Reed', 'Rob', 'Roman', 'Rusty', 'Sky', 'Stone', 'Wade', 'Woody', 'Blaze', 'Chase', 'Chip', 'Colt', 'Dash', 'Jett', 'Link', 'Cash', 'King', 'Legend', 'Major', 'Reign', 'Royal', 'Saint', 'Wilder', 'Zen', 'Angel', 'Blue', 'Cricket', 'Destiny', 'Faith', 'Grace', 'Harmony', 'Haven', 'Heaven', 'Honor', 'Hope', 'Journey', 'Joy', 'Justice', 'Liberty', 'Melody', 'Mercy', 'Patience', 'Peace', 'Precious', 'Serenity', 'Trinity', 'True', 'Wisdom', 'Winter', 'August', 'Christian', 'Genesis', 'Noel', 'Paris', 'Reagan', 'Zion', 'Boat', 'Apple', 'Amazon', 'Google', 'Microsoft' ];
  const protectedWordMap = new Map(); let modifiedText = text; PROTECTED_WORDS.forEach((word, index) => { const regex = new RegExp(`\\b${word}\\b`, 'gi'); const placeholder = `__PROTECTED_${index}__`; modifiedText = modifiedText.replace(regex, (match) => { protectedWordMap.set(placeholder, match); return placeholder; }); }); const response = await env.AI.run("@cf/meta/m2m100-1.2b", { text: modifiedText, source_lang: "en", target_lang: targetLang }); if (!response?.translated_text) throw new AIServiceError("Translation failed to produce a valid response."); let translatedText = response.translated_text; protectedWordMap.forEach((originalWord, placeholder) => { translatedText = translatedText.replace(new RegExp(placeholder, 'g'), originalWord); }); return translatedText;
}

// =================================================================================
// MAIN FETCH HANDLER
// =================================================================================

export default {
  async fetch(request, env, context) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/') {
      try {
        // ... (Your initial logic: rate limiting, validation, translation to English)
        const clientIP = getClientIP(request); checkRateLimit(clientIP); if (!request.headers.get("Content-Type")?.includes("application/json")) { throw new ValidationError("Content-Type must be application/json"); } const { text, sourceLang, targetLang } = await request.json(); validateInput(text, sourceLang, targetLang); let englishText = text; if (sourceLang !== 'en') { const toEnglishResponse = await env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: sourceLang, target_lang: "en" }); englishText = toEnglishResponse?.translated_text; if (!englishText) throw new AIServiceError("Translation to English failed."); }

        // Step 2: Generate a high-quality summary using the selected model
        let summaryText = await generateSummary(englishText, env, MODEL_TO_TEST);
        summaryText = deduplicateSummary(summaryText);

        // Step 3: Translate the final summary to the target language
        let translatedText = summaryText;
        if (targetLang !== 'en') {
          translatedText = await translateWithProtectedWords(summaryText, targetLang, env);
        }

        const result = JSON.stringify({ summary: summaryText, translated: translatedText, target_language: targetLang });
        const cacheKey = sanitizeCacheKey(sourceLang, targetLang, text);
        context.waitUntil(env.EDGESCRIBE_CACHE.put(cacheKey, result, { expirationTtl: CONFIG.CACHE_TTL }));
        return new Response(result, { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

      } catch (err) {
        // ... (Your error handling logic)
        console.error("Request error:", err); let status = 500; let errorResponse = { error: "Internal Server Error" }; if (err instanceof ValidationError) { status = 400; errorResponse = { error: err.message }; } else if (err instanceof RateLimitError) { status = 429; errorResponse = { error: err.message }; } else if (err instanceof AIServiceError) { status = 503; errorResponse = { error: err.message }; } return new Response(JSON.stringify(errorResponse), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
    }
    // For all other requests, serve from static assets
    return env.ASSETS.fetch(request);
  },

};
