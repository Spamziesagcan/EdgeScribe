// _worker.js - Final Version with High-Quality Summary & Translation

// =================================================================================
// CONFIGURATION AND HELPERS
// =================================================================================

const SUPPORTED_LANGUAGES = [ "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "gu", "mr", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "tr", "el", "he", "th", "vi", "id", "ms", "tl", "sw", "am", "eu", "be", "bg", "bn", "hr", "ca" ];
const CONFIG = { MAX_TEXT_LENGTH: 5000, CACHE_TTL: 3600, RATE_LIMIT_PER_IP: 60 };
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" };

class ValidationError extends Error { constructor(message) { super(message); this.name = "ValidationError"; } }
class RateLimitError extends Error { constructor(message) { super(message); this.name = "RateLimitError"; } }
class AIServiceError extends Error { constructor(message) { super(message); this.name = "AIServiceError"; } }

function validateInput(text, sourceLang, targetLang) {
    if (!text || typeof text !== "string" || text.trim().length === 0) throw new ValidationError("Text parameter is required and cannot be empty");
    if (text.length > CONFIG.MAX_TEXT_LENGTH) throw new ValidationError(`Text exceeds maximum length of ${CONFIG.MAX_TEXT_LENGTH} characters`);
    // This is where the error was happening. It now has access to the constant above.
    if (!sourceLang || !SUPPORTED_LANGUAGES.includes(sourceLang)) throw new ValidationError(`Invalid source language provided.`);
    if (!targetLang || !SUPPORTED_LANGUAGES.includes(targetLang)) throw new ValidationError(`Invalid target language provided.`);
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function sanitizeCacheKey(sourceLang, targetLang, text) {
    const textHash = hashString(text.substring(0, 100));
    return `translate:${sourceLang}:${targetLang}:${textHash}`;
}

const rateLimitStore = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const requests = rateLimitStore.get(ip) || [];
    const recentRequests = requests.filter((time) => time > (now - 60000));
    if (recentRequests.length >= CONFIG.RATE_LIMIT_PER_IP) {
        throw new RateLimitError("Rate limit exceeded. Please try again later.");
    }
    recentRequests.push(now);
    rateLimitStore.set(ip, recentRequests);
}

function getClientIP(request) {
    return request.headers.get("CF-Connecting-IP") || "127.0.0.1";
}

function cleanSummaryPreamble(responseText) {
    const parts = responseText.split('\n\n');
    if (parts.length > 1 && parts[1].length > parts[0].length) return parts[1].trim();
    const lines = responseText.split('\n');
    if (lines.length > 1 && lines[0].toLowerCase().startsWith("here is")) return lines.slice(1).join('\n').trim();
    return responseText.trim();
}

function deduplicateSummary(summaryText) {
    const sentences = summaryText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const uniqueSentences = [];
    const seen = new Set();
    sentences.forEach(sentence => {
        const normalized = sentence.toLowerCase();
        if (!seen.has(normalized)) uniqueSentences.push(sentence);
    });
    return uniqueSentences.join('. ') + (uniqueSentences.length ? '.' : '');
}

function getLanguageName(code) {
    const languageMap = { 'hi': 'Hindi', 'gu': 'Gujarati', 'mr': 'Marathi', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese', 'ar': 'Arabic', 'nl': 'Dutch' };
    return languageMap[code] || code;
}

// =================================================================================
// AI FUNCTIONS
// =================================================================================

async function generateSummary(text, env) {
    const prompt = `
Summarize the following text in a clear and concise manner, capturing all essential points and conclusions.
IMPORTANT: Your response must start directly with the first sentence of the summary. Do not include any introductory phrases like "Here is a summary:".
Here is the text:
---
${text}
---
Summary:`;

    try {
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', { prompt, max_tokens: 350 });
        const summary = aiResponse.response?.trim() || "";
        if (summary.length === 0) throw new Error("Summarization model returned an empty response.");
        return cleanSummaryPreamble(summary);
    } catch (err) {
        console.error("Error calling summarization model:", err);
        throw new AIServiceError("The AI summarization service failed.");
    }
}

// _worker.js

// =================================================================================
// FINAL: A general-purpose, high-quality translation function
// =================================================================================
// _worker.js

// =================================================================================
// FINAL: A self-correcting, "Plan and Execute" translation function
// =================================================================================
async function translateWithLlama(text, targetLang, env) {
    const targetLanguageName = getLanguageName(targetLang);

    // This is the new, most rigorous prompt. It forces the AI to build a
    // dictionary for the text and then strictly follow it.
    const prompt = `
You are an expert literary translator. Your mission is to follow a strict two-step process to translate English text into flawless ${targetLanguageName}.

**Step 1: Create a Translation Plan.**
Inside <thinking> tags, you MUST create a 'Key Terms' dictionary. For ALL significant English nouns in the text (like characters, animals, or objects), you MUST define their single, correct ${targetLanguageName} translation. For example:
<thinking>
[
  { "English": "Wolf", "Translation": "लांडगा" },
  { "English": "Shepherd", "Translation": "धनगर" },
  { "English": "Flock", "Translation": "कळप" }
]
</thinking>

**Step 2: Execute the Translation.**
After creating the plan, produce the final translation inside <final_translation> tags.
- You MUST use ONLY the specific translations you defined in your 'Key Terms' dictionary from Step 1.
- The <final_translation> block MUST be pure ${targetLanguageName}. It must not contain any English words, your thinking process, or any other language.

Here is the text to process:
<text_to_translate>
${text}
</text_to_translate>
`;

    console.log(`Translating to ${targetLanguageName} with 'Plan and Execute' prompt...`);

    try {
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            prompt: prompt,
            max_tokens: 1024
        });

        let fullResponse = aiResponse.response?.trim() || "";

        // Parse the response to extract ONLY the final translation
        const startTag = '<final_translation>';
        const endTag = '</final_translation>';
        
        const startIndex = fullResponse.indexOf(startTag);
        const endIndex = fullResponse.indexOf(endTag);

        if (startIndex !== -1 && endIndex !== -1) {
            let translatedText = fullResponse.substring(startIndex + startTag.length, endIndex).trim();
            translatedText = translatedText.replace(/<\/?[^>]+(>|$)/g, ""); // Clean any stray tags

            if (translatedText.length > 0) {
                return translatedText;
            }
        }
        
        throw new Error("LLM failed to produce a valid structured response.");

    } catch (err) {
        console.error(`Error during structured translation:`, err);
        console.log("Falling back to the basic translation model.");
        const fallbackResponse = await env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: "en", target_lang: targetLang });
        if (!fallbackResponse?.translated_text) {
            throw new AIServiceError("Translation failed on both primary and fallback models.");
        }
        return fallbackResponse.translated_text;
    }
}

// =================================================================================
// MAIN FETCH HANDLER
// =================================================================================

export default {
    async fetch(request, env, context) {
        if (request.method === 'POST' && new URL(request.url).pathname === '/') {
            try {
                const clientIP = getClientIP(request);
                checkRateLimit(clientIP);

                if (!request.headers.get("Content-Type")?.includes("application/json")) {
                    throw new ValidationError("Content-Type must be application/json");
                }

                const { text, sourceLang, targetLang } = await request.json();
                validateInput(text, sourceLang, targetLang);

                // Step 1: Translate to English for a consistent base language
                let englishText = text;
                if (sourceLang !== 'en') {
                    const toEnglishResponse = await env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: sourceLang, target_lang: "en" });
                    englishText = toEnglishResponse?.translated_text;
                    if (!englishText) throw new AIServiceError("Translation to English failed.");
                }

                // Step 2: Generate a high-quality summary
                let summaryText = await generateSummary(englishText, env);
                summaryText = deduplicateSummary(summaryText);

                // Step 3: Translate the final summary to the target language
                let translatedText = summaryText;
                if (targetLang !== 'en') {
                    translatedText = await translateWithLlama(summaryText, targetLang, env);
                }

                const result = JSON.stringify({ summary: summaryText, translated: translatedText, target_language: targetLang });
                const cacheKey = sanitizeCacheKey(sourceLang, targetLang, text);
                context.waitUntil(env.EDGESCRIBE_CACHE.put(cacheKey, result, { expirationTtl: CONFIG.CACHE_TTL }));

                return new Response(result, { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

            } catch (err) {
                console.error("Request error:", err);
                let status = 500;
                let errorResponse = { error: "Internal Server Error" };
                if (err instanceof ValidationError) { status = 400; errorResponse = { error: err.message }; }
                else if (err instanceof RateLimitError) { status = 429; errorResponse = { error: err.message }; }
                else if (err instanceof AIServiceError) { status = 503; errorResponse = { error: err.message }; }
                return new Response(JSON.stringify(errorResponse), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
            }
        }
        // For all other requests (e.g., GET for your index.html), serve from static assets
        return env.ASSETS.fetch(request);
    },
};







