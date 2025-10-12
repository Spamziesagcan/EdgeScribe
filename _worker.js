// _worker.js - For Cloudflare Pages Full-Stack Deployment (DEBUGGED)

// =================================================================================
// HELPER FUNCTIONS AND CONFIGURATION
// =================================================================================

const SUPPORTED_LANGUAGES = [ "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "tr", "el", "he", "th", "vi", "id", "ms", "tl", "sw", "am", "eu", "be", "bg", "bn", "hr", "ca" ];
const CONFIG = { MAX_TEXT_LENGTH: 5000, CACHE_TTL: 3600, AI_TIMEOUT: 30000, RATE_LIMIT_PER_IP: 60 };
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" };

class ValidationError extends Error { constructor(message) { super(message); this.name = "ValidationError"; } }
class RateLimitError extends Error { constructor(message) { super(message); this.name = "RateLimitError"; } }
class AIServiceError extends Error { constructor(message) { super(message); this.name = "AIServiceError"; } }

function validateInput(text, sourceLang, targetLang) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new ValidationError("Text parameter is required and cannot be empty");
    }
    // FIXED: Corrected template literal string
    if (text.length > CONFIG.MAX_TEXT_LENGTH) {
        throw new ValidationError(`Text exceeds maximum length of ${CONFIG.MAX_TEXT_LENGTH} characters`);
    }
    if (!sourceLang || typeof sourceLang !== "string" || !SUPPORTED_LANGUAGES.includes(sourceLang)) {
        throw new ValidationError("Invalid source language provided.");
    }
    if (!targetLang || typeof targetLang !== "string" || !SUPPORTED_LANGUAGES.includes(targetLang)) {
        throw new ValidationError("Invalid target language provided.");
    }
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
    // FIXED: Corrected template literal string
    return `translate:${sourceLang}:${targetLang}:${textHash}`;
}

const rateLimitStore = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - 60000;
    if (!rateLimitStore.has(ip)) {
        rateLimitStore.set(ip, []);
    }
    const requests = rateLimitStore.get(ip);
    const recentRequests = requests.filter((time) => time > windowStart);
    if (recentRequests.length >= CONFIG.RATE_LIMIT_PER_IP) {
        throw new RateLimitError("Rate limit exceeded. Please try again later.");
    }
    recentRequests.push(now);
    rateLimitStore.set(ip, recentRequests);
}

function getClientIP(request) {
    return request.headers.get("CF-Connecting-IP") || "127.0.0.1";
}

function handleOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function handleHealthCheck() {
    return new Response(
        JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
}

function chunkText(text, chunkSize) {
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];
    const chunks = [];
    let currentChunk = "";
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= chunkSize) {
            currentChunk += sentence;
        } else {
            chunks.push(currentChunk);
            currentChunk = sentence;
        }
    }
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    return chunks;
}

// MOVED and FIXED: This function is now in the helper section for better organization.
function deduplicateSummary(summaryText) {
    const sentences = summaryText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const uniqueSentences = [];
    const seen = new Set();
    sentences.forEach(sentence => {
        const normalized = sentence.toLowerCase();
        if (!seen.has(normalized)) {
            uniqueSentences.push(sentence);
            seen.add(normalized);
        }
    });
    return uniqueSentences.join('. ') + (uniqueSentences.length ? '.' : '');
}

// =================================================================================
// AI FUNCTIONS
// =================================================================================

async function translateWithProtectedWords(text, targetLang, env) {
    const PROTECTED_WORDS = [ 'Harsh', 'Rocky', 'Lucky', 'Honey', 'Deep', 'Rose', 'Sunny', 'Jasmine', 'Crystal', 'Bill', 'Frank', 'Mark', 'Amber', 'Brandy', 'Brooks', 'Clay', 'Cliff', 'Dean', 'Drew', 'Duke', 'Forrest', 'Grant', 'Hunter', 'Lance', 'Miles', 'Reed', 'Rob', 'Roman', 'Rusty', 'Sky', 'Stone', 'Wade', 'Woody', 'Blaze', 'Chase', 'Chip', 'Colt', 'Dash', 'Jett', 'Link', 'Cash', 'King', 'Legend', 'Major', 'Reign', 'Royal', 'Saint', 'Wilder', 'Zen', 'Angel', 'Blue', 'Cricket', 'Destiny', 'Faith', 'Grace', 'Harmony', 'Haven', 'Heaven', 'Honor', 'Hope', 'Journey', 'Joy', 'Justice', 'Liberty', 'Melody', 'Mercy', 'Patience', 'Peace', 'Precious', 'Serenity', 'Trinity', 'True', 'Wisdom', 'Winter', 'August', 'Christian', 'Genesis', 'Noel', 'Paris', 'Reagan', 'Zion', 'Boat', 'Apple', 'Amazon', 'Google', 'Microsoft' ];
    const protectedWordMap = new Map();
    let modifiedText = text;

    PROTECTED_WORDS.forEach((word, index) => {
        // FIXED: Correctly escaped backslashes for the RegExp constructor
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const placeholder = `__PROTECTED_${index}__`;
        modifiedText = modifiedText.replace(regex, (match) => {
            protectedWordMap.set(placeholder, match);
            return placeholder;
        });
    });

    const response = await env.AI.run("@cf/meta/m2m100-1.2b", {
        text: modifiedText,
        source_lang: "en",
        target_lang: targetLang
    });

    if (!response?.translated_text) {
        throw new AIServiceError("Translation failed to produce a valid response.");
    }

    let translatedText = response.translated_text;
    protectedWordMap.forEach((originalWord, placeholder) => {
        translatedText = translatedText.replace(new RegExp(placeholder, 'g'), originalWord);
    });

    return translatedText;
}

async function summarizeInChunks(text, env) {
    const chunks = chunkText(text, 3500);
    if (!chunks || chunks.length === 0) {
        console.error("Failed to generate any text chunks.");
        return "";
    }

    console.log(`Summarizing text in ${chunks.length} chunk(s).`);

    const summaryPromises = chunks.map(chunk =>
        env.AI.run("@cf/facebook/bart-large-cnn", {
            requests: [{ input_text: chunk, max_length: 150 }]
        })
        .catch(err => {
            console.error("Error summarizing a chunk:", err);
            return null;
        })
    );

    const chunkSummaryResponses = await Promise.all(summaryPromises);

    const combinedSummaries = chunkSummaryResponses
        .filter(response => response && response[0] && response[0].summary)
        .map(response => response[0].summary)
        .join(" ");

    if (!combinedSummaries || combinedSummaries.trim().length === 0) {
        console.error("All chunk summaries failed or were empty.");
        return text.split(/[.!?]+/).slice(0, 3).join('. ').trim() + '.';
    }

    if (chunks.length === 1 || combinedSummaries.length < 500) {
        return combinedSummaries;
    }

    console.log("Generating final summary from combined chunk summaries.");
    try {
        const finalSummaryResponse = await env.AI.run("@cf/facebook/bart-large-cnn", {
            requests: [{ input_text: "Concisely summarize the following points: " + combinedSummaries, max_length: 300 }]
        });

        if (finalSummaryResponse && finalSummaryResponse[0] && finalSummaryResponse[0].summary) {
            return finalSummaryResponse[0].summary;
        } else {
            console.log("Final summary generation failed. Falling back to combined summaries.");
            return combinedSummaries;
        }
    } catch (err) {
        console.error("Error during final summarization step:", err);
        return combinedSummaries;
    }
}

// =================================================================================
// MAIN FETCH HANDLER
// =================================================================================

export default {
    async fetch(request, env, context) {
        const url = new URL(request.url);

        const isApiRequest = (
            (request.method === 'POST' && url.pathname === '/') ||
            url.pathname.startsWith('/health') ||
            url.pathname.startsWith('/debug')
        );

        if (!isApiRequest) {
            return env.ASSETS.fetch(request);
        }

        try {
            if (request.method === "OPTIONS") return handleOptions();
            if (url.pathname === "/health") return handleHealthCheck();

            if (request.method === "POST" && url.pathname === "/") {
                const clientIP = getClientIP(request);
                checkRateLimit(clientIP);

                const contentType = request.headers.get("Content-Type");
                if (!contentType || !contentType.includes("application/json")) {
                    throw new ValidationError("Content-Type must be application/json");
                }

                const { text, sourceLang, targetLang } = await request.json();
                validateInput(text, sourceLang, targetLang);

                let englishText = text;
                if (sourceLang !== 'en') {
                    const toEnglishResponse = await env.AI.run("@cf/meta/m2m100-1.2b", {
                        text,
                        source_lang: sourceLang,
                        target_lang: "en",
                    });
                    if (!toEnglishResponse?.translated_text) {
                        throw new AIServiceError("Translation to English failed.");
                    }
                    englishText = toEnglishResponse.translated_text;
                }

                let summaryText = "";
                if (englishText.length < 200) {
                    console.log("Input is short. Using single summarization call.");
                    try {
                        const summaryResponse = await env.AI.run("@cf/facebook/bart-large-cnn", {
                            requests: [{ input_text: englishText, max_length: 100 }]
                        });
                        summaryText = summaryResponse && summaryResponse[0] ? summaryResponse[0].summary : englishText;
                    } catch (err) {
                        console.error("Error during single summarization call:", err);
                        summaryText = englishText;
                    }
                } else {
                    summaryText = await summarizeInChunks(englishText, env);
                }

                if (!summaryText || summaryText.trim().length === 0) {
                    throw new AIServiceError("Summarization failed to produce a valid response.");
                }

                summaryText = deduplicateSummary(summaryText);

                let translatedText = summaryText;
                if (targetLang !== 'en') {
                    translatedText = await translateWithProtectedWords(summaryText, targetLang, env);
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

                return new Response(result, {
                    headers: { "Content-Type": "application/json", "X-Cache-Status": "MISS", ...CORS_HEADERS }
                });
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