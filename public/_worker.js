// _worker.js - Dynamic Translation Worker for Cloudflare Pages

// =================================================================================
// DYNAMIC CONFIGURATION AND CONSTANTS
// =================================================================================
const BASE_CONFIG = {
    MAX_TEXT_LENGTH: 5000,
    CACHE_TTL: 3600,
    AI_TIMEOUT: 30000,
    RATE_LIMIT_PER_IP: 60,
    TRANSLATION_MODELS: {
        primary: "@cf/meta/m2m100-1.2b",
        fallbacks: ["@cf/meta/m2m100-1.2b"] // Same model as fallback for now
    },
    SUMMARIZATION_MODELS: {
        primary: "@cf/facebook/bart-large-cnn",
        fallbacks: ["@cf/facebook/bart-large-cnn"]
    }
};

const SUPPORTED_LANGUAGES = [
    "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", 
    "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "tr", "el", "he", 
    "th", "vi", "id", "ms", "tl", "sw", "am", "eu", "be", "bg", "bn", "hr", "ca"
];

// Language fallback mapping for unsupported languages
const LANGUAGE_FALLBACKS = {
    'ca': 'es', // Catalan → Spanish
    'gl': 'es', // Galician → Spanish
    'eu': 'es', // Basque → Spanish
    'cy': 'en', // Welsh → English
    'ga': 'en', // Irish → English
    'mt': 'en', // Maltese → English
    'is': 'da', // Icelandic → Danish
    'fo': 'da', // Faroese → Danish
    'lb': 'de', // Luxembourgish → German
    'rm': 'de', // Romansh → German
};

// Comprehensive protected words database
const PROTECTED_WORDS_DATABASE = {
    // Personal Names - Common English Names
    personal_names: [
        // Male Names
        'Aaron', 'Adam', 'Adrian', 'Alan', 'Albert', 'Alex', 'Alexander', 'Allen', 'Andrew', 'Anthony',
        'Arthur', 'Austin', 'Benjamin', 'Bill', 'Blake', 'Brandon', 'Brian', 'Bruce', 'Bryan', 'Carl',
        'Carlos', 'Charles', 'Christian', 'Christopher', 'Craig', 'Daniel', 'David', 'Dean', 'Dennis', 'Douglas',
        'Drew', 'Edward', 'Eric', 'Frank', 'Gary', 'George', 'Grant', 'Gregory', 'Harold', 'Harry',
        'Henry', 'Jack', 'James', 'Jason', 'Jeffrey', 'Jeremy', 'John', 'Jonathan', 'Joseph', 'Joshua',
        'Justin', 'Keith', 'Kenneth', 'Kevin', 'Larry', 'Lawrence', 'Mark', 'Matthew', 'Michael', 'Nicholas',
        'Patrick', 'Paul', 'Peter', 'Philip', 'Raymond', 'Richard', 'Robert', 'Ronald', 'Ryan', 'Samuel',
        'Scott', 'Sean', 'Stephen', 'Steven', 'Thomas', 'Timothy', 'William', 'Zachary',
        
        // Female Names
        'Amanda', 'Amy', 'Andrea', 'Angela', 'Anna', 'Ashley', 'Barbara', 'Betty', 'Brenda', 'Carol',
        'Carolyn', 'Catherine', 'Christine', 'Cynthia', 'Deborah', 'Debra', 'Diana', 'Donna', 'Dorothy', 'Elizabeth',
        'Emily', 'Emma', 'Evelyn', 'Frances', 'Helen', 'Janet', 'Janice', 'Jean', 'Jennifer', 'Jessica',
        'Joan', 'Joyce', 'Judith', 'Julie', 'Karen', 'Kathleen', 'Kathryn', 'Kelly', 'Kimberly', 'Laura',
        'Linda', 'Lisa', 'Margaret', 'Maria', 'Marie', 'Martha', 'Mary', 'Melissa', 'Michelle', 'Nancy',
        'Nicole', 'Olivia', 'Pamela', 'Patricia', 'Rachel', 'Rebecca', 'Ruth', 'Sandra', 'Sarah', 'Sharon',
        'Stephanie', 'Susan', 'Teresa', 'Virginia', 'Wendy',
        
        // Unique/Modern Names
        'Harsh', 'Rocky', 'Lucky', 'Honey', 'Deep', 'Rose', 'Sunny', 'Jasmine', 'Crystal', 'Amber', 
        'Brandy', 'Brooks', 'Clay', 'Cliff', 'Duke', 'Forrest', 'Hunter', 'Lance', 'Miles', 'Reed', 
        'Rob', 'Roman', 'Rusty', 'Sky', 'Stone', 'Wade', 'Woody', 'Blaze', 'Chase', 'Chip', 'Colt', 
        'Dash', 'Jett', 'Link', 'Cash', 'King', 'Legend', 'Major', 'Reign', 'Royal', 'Saint', 'Wilder', 
        'Zen', 'Angel', 'Blue', 'Cricket', 'Destiny', 'Faith', 'Grace', 'Harmony', 'Haven', 'Heaven', 
        'Honor', 'Hope', 'Journey', 'Joy', 'Justice', 'Liberty', 'Melody', 'Mercy', 'Patience', 'Peace', 
        'Precious', 'Serenity', 'Trinity', 'True', 'Wisdom', 'Winter', 'August', 'Genesis', 'Noel', 
        'Paris', 'Reagan', 'Zion'
    ],
    
    // Brand Names and Companies
    company_names: [
        'Apple', 'Microsoft', 'Google', 'Amazon', 'Facebook', 'Meta', 'Netflix', 'Tesla', 'Samsung',
        'Sony', 'Nike', 'Adidas', 'Coca-Cola', 'Pepsi', 'McDonald\'s', 'Starbucks', 'Walmart', 'Target',
        'IBM', 'Intel', 'AMD', 'NVIDIA', 'Oracle', 'Salesforce', 'Adobe', 'Uber', 'Airbnb', 'PayPal',
        'Visa', 'MasterCard', 'American Express', 'Goldman Sachs', 'JPMorgan', 'Morgan Stanley',
        'Ford', 'BMW', 'Mercedes', 'Audi', 'Toyota', 'Honda', 'Volkswagen', 'Ferrari', 'Lamborghini',
        'Rolex', 'Gucci', 'Louis Vuitton', 'Prada', 'Chanel', 'Versace', 'Armani', 'Burberry'
    ],
    
    // Place Names (Major Cities/Countries that might be used as names)
    place_names: [
        'Austin', 'Dallas', 'Houston', 'Phoenix', 'Denver', 'Portland', 'Seattle', 'Atlanta', 'Miami',
        'Orlando', 'Tampa', 'Nashville', 'Memphis', 'Charlotte', 'Raleigh', 'Virginia', 'Georgia',
        'Carolina', 'Montana', 'Dakota', 'Nevada', 'Arizona', 'Colorado', 'Indiana', 'Maryland',
        'Delaware', 'Connecticut', 'Vermont', 'Maine', 'Alaska', 'Hawaii', 'Utah', 'Idaho', 'Wyoming',
        'London', 'Paris', 'Berlin', 'Rome', 'Madrid', 'Vienna', 'Prague', 'Dublin', 'Edinburgh',
        'Glasgow', 'Cardiff', 'Belfast', 'Amsterdam', 'Brussels', 'Geneva', 'Zurich', 'Stockholm',
        'Oslo', 'Helsinki', 'Copenhagen', 'Warsaw', 'Budapest', 'Bucharest', 'Sofia', 'Zagreb',
        'Athens', 'Istanbul', 'Moscow', 'Kiev', 'Minsk', 'Riga', 'Vilnius', 'Tallinn'
    ],
    
    // Generic/Objects that could be names
    object_names: [
        'Boat', 'River', 'Lake', 'Ocean', 'Mountain', 'Valley', 'Forest', 'Desert', 'Island', 'Beach',
        'Storm', 'Thunder', 'Lightning', 'Rain', 'Snow', 'Ice', 'Fire', 'Flame', 'Spark', 'Ember',
        'Star', 'Moon', 'Sun', 'Cloud', 'Wind', 'Wave', 'Tide', 'Current', 'Stream', 'Brook',
        'Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Gold', 'Silver', 'Platinum', 'Bronze', 'Copper'
    ]
};

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
};

// =================================================================================
// ERROR CLASSES
// =================================================================================
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}

class RateLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = "RateLimitError";
    }
}

class AIServiceError extends Error {
    constructor(message, model = null) {
        super(message);
        this.name = "AIServiceError";
        this.model = model;
    }
}

class TranslationError extends Error {
    constructor(message, sourceLang = null, targetLang = null) {
        super(message);
        this.name = "TranslationError";
        this.sourceLang = sourceLang;
        this.targetLang = targetLang;
    }
}

// =================================================================================
// DYNAMIC CONFIGURATION LOADER
// =================================================================================
async function loadDynamicConfig(env) {
    let config = { ...BASE_CONFIG };
    
    try {
        // Try to load custom config from KV store if available
        if (env.EDGESCRIBE_CONFIG) {
            const customConfig = await env.EDGESCRIBE_CONFIG.get("app_config", "json");
            if (customConfig) {
                config = { ...config, ...customConfig };
            }
        }
    } catch (error) {
        console.warn("Failed to load dynamic config, using base config:", error);
    }
    
    return config;
}

// =================================================================================
// PROTECTED WORDS MANAGEMENT
// =================================================================================
function getAllProtectedWords() {
    return [
        ...PROTECTED_WORDS_DATABASE.personal_names,
        ...PROTECTED_WORDS_DATABASE.company_names,
        ...PROTECTED_WORDS_DATABASE.place_names,
        ...PROTECTED_WORDS_DATABASE.object_names
    ];
}

async function loadCustomProtectedWords(env) {
    try {
        if (env.EDGESCRIBE_CONFIG) {
            const customWords = await env.EDGESCRIBE_CONFIG.get("protected_words", "json");
            if (customWords && Array.isArray(customWords)) {
                return [...getAllProtectedWords(), ...customWords];
            }
        }
    } catch (error) {
        console.warn("Failed to load custom protected words:", error);
    }
    
    return getAllProtectedWords();
}

// =================================================================================
// TRANSLATION UTILITIES
// =================================================================================
function validateInput(text, sourceLang, targetLang) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new ValidationError("Text parameter is required and cannot be empty");
    }
    
    if (text.length > BASE_CONFIG.MAX_TEXT_LENGTH) {
        throw new ValidationError(`Text exceeds maximum length of ${BASE_CONFIG.MAX_TEXT_LENGTH} characters`);
    }
    
    if (!sourceLang || typeof sourceLang !== "string" || !SUPPORTED_LANGUAGES.includes(sourceLang)) {
        throw new ValidationError("Invalid source language provided");
    }
    
    if (!targetLang || typeof targetLang !== "string" || !SUPPORTED_LANGUAGES.includes(targetLang)) {
        throw new ValidationError("Invalid target language provided");
    }
}

function getEffectiveLanguage(langCode) {
    return LANGUAGE_FALLBACKS[langCode] || langCode;
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

// =================================================================================
// AI SERVICE WITH FALLBACK
// =================================================================================
async function callAIWithFallback(env, modelConfig, params) {
    const models = [modelConfig.primary, ...modelConfig.fallbacks];
    let lastError;
    
    for (const model of models) {
        try {
            const response = await env.AI.run(model, params);
            if (response) {
                return response;
            }
        } catch (error) {
            console.warn(`Model ${model} failed:`, error);
            lastError = error;
        }
    }
    
    throw new AIServiceError(`All models failed. Last error: ${lastError?.message}`, models[0]);
}

// =================================================================================
// ADVANCED TRANSLATION WITH PROTECTED WORDS
// =================================================================================
async function translateWithProtectedWords(text, sourceLang, targetLang, env, config) {
    if (sourceLang === targetLang) {
        return text;
    }
    
    const protectedWords = await loadCustomProtectedWords(env);
    const protectedWordMap = new Map();
    let modifiedText = text;
    
    // Replace protected words with unique placeholders
    protectedWords.forEach((word, index) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const placeholder = `__PROTECTED_${index}__`;
        
        modifiedText = modifiedText.replace(regex, (match) => {
            protectedWordMap.set(placeholder, match);
            return placeholder;
        });
    });
    
    // Get effective languages for translation
    const effectiveSourceLang = getEffectiveLanguage(sourceLang);
    const effectiveTargetLang = getEffectiveLanguage(targetLang);
    
    // Translate text with placeholders
    const response = await callAIWithFallback(env, config.TRANSLATION_MODELS, {
        text: modifiedText,
        source_lang: effectiveSourceLang,
        target_lang: effectiveTargetLang
    });
    
    if (!response?.translated_text) {
        throw new TranslationError("Translation failed to produce a valid response", sourceLang, targetLang);
    }
    
    let translatedText = response.translated_text;
    
    // Restore protected words from placeholders
    protectedWordMap.forEach((originalWord, placeholder) => {
        translatedText = translatedText.replace(new RegExp(placeholder, 'g'), originalWord);
    });
    
    return translatedText;
}

// =================================================================================
// DIRECT TRANSLATION OPTION
// =================================================================================
async function attemptDirectTranslation(text, sourceLang, targetLang, env, config) {
    try {
        // Skip English intermediate for supported language pairs
        const directSupportedPairs = [
            ['es', 'fr'], ['fr', 'es'], ['de', 'fr'], ['fr', 'de'], ['it', 'es'], ['es', 'it'],
            ['pt', 'es'], ['es', 'pt'], ['zh', 'ja'], ['ja', 'zh'], ['ar', 'en'], ['en', 'ar']
        ];
        
        const isDirect = directSupportedPairs.some(([src, tgt]) => 
            (src === sourceLang && tgt === targetLang) || 
            (src === targetLang && tgt === sourceLang)
        );
        
        if (isDirect && sourceLang !== 'en' && targetLang !== 'en') {
            return await translateWithProtectedWords(text, sourceLang, targetLang, env, config);
        }
        
        return null; // Fall back to English intermediate
    } catch (error) {
        console.warn("Direct translation failed, falling back to English intermediate:", error);
        return null;
    }
}

// =================================================================================
// RATE LIMITING
// =================================================================================
const rateLimitStore = new Map();

function checkRateLimit(ip, config) {
    const now = Date.now();
    const windowStart = now - 60000;
    
    if (!rateLimitStore.has(ip)) {
        rateLimitStore.set(ip, []);
    }
    
    const requests = rateLimitStore.get(ip);
    const recentRequests = requests.filter(time => time > windowStart);
    
    if (recentRequests.length >= config.RATE_LIMIT_PER_IP) {
        throw new RateLimitError("Rate limit exceeded. Please try again later.");
    }
    
    recentRequests.push(now);
    rateLimitStore.set(ip, recentRequests);
}

function getClientIP(request) {
    return request.headers.get("CF-Connecting-IP") || 
           request.headers.get("X-Forwarded-For")?.split(',')[0] ||
           "127.0.0.1";
}

// =================================================================================
// RESPONSE HANDLERS
// =================================================================================
function handleOptions() {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
    });
}

function handleHealthCheck() {
    return new Response(
        JSON.stringify({
            status: "healthy",
            timestamp: new Date().toISOString(),
            version: "2.0.0",
            features: {
                protected_words: getAllProtectedWords().length,
                supported_languages: SUPPORTED_LANGUAGES.length,
                fallback_languages: Object.keys(LANGUAGE_FALLBACKS).length
            }
        }),
        {
            headers: {
                "Content-Type": "application/json",
                ...CORS_HEADERS
            }
        }
    );
}

async function handleDebug(env, config) {
    const protectedWords = await loadCustomProtectedWords(env);
    
    return new Response(
        JSON.stringify({
            kv_bound: !!env.EDGESCRIBE_CACHE,
            config_bound: !!env.EDGESCRIBE_CONFIG,
            ai_bound: !!env.AI,
            config: {
                ...config,
                protected_words_count: protectedWords.length,
                supported_languages_count: SUPPORTED_LANGUAGES.length
            },
            capabilities: {
                direct_translation: true,
                protected_words: true,
                language_fallbacks: true,
                model_fallbacks: true
            }
        }),
        {
            headers: {
                "Content-Type": "application/json",
                ...CORS_HEADERS
            }
        }
    );
}

// =================================================================================
// MAIN FETCH HANDLER
// =================================================================================
export default {
    async fetch(request, env, context) {
        const url = new URL(request.url);
        const isApiRequest = (request.method === 'POST' && url.pathname === '/') || 
                           url.pathname.startsWith('/health') || 
                           url.pathname.startsWith('/debug');
        
        // Serve static assets for non-API requests
        if (!isApiRequest) {
            return env.ASSETS.fetch(request);
        }

        try {
            // Load dynamic configuration
            const config = await loadDynamicConfig(env);
            
            if (request.method === "OPTIONS") return handleOptions();
            if (url.pathname === "/health") return handleHealthCheck();
            
            const clientIP = getClientIP(request);
            
            if (url.pathname === "/debug") {
                return await handleDebug(env, config);
            }

            if (request.method === "POST" && url.pathname === "/") {
                checkRateLimit(clientIP, config);

                const contentType = request.headers.get("Content-Type");
                if (!contentType || !contentType.includes("application/json")) {
                    throw new ValidationError("Content-Type must be application/json");
                }
                
                const { text, sourceLang, targetLang } = await request.json();
                validateInput(text, sourceLang, targetLang);

                // Check cache first
                const cacheKey = sanitizeCacheKey(sourceLang, targetLang, text);
                let cacheStatus = "MISS";
                
                if (env.EDGESCRIBE_CACHE) {
                    const cached = await env.EDGESCRIBE_CACHE.get(cacheKey);
                    if (cached) {
                        return new Response(cached, {
                            headers: {
                                "Content-Type": "application/json",
                                "X-Cache-Status": "HIT",
                                ...CORS_HEADERS
                            }
                        });
                    }
                }

                // Attempt direct translation first
                let directTranslation = await attemptDirectTranslation(text, sourceLang, targetLang, env, config);
                
                if (directTranslation) {
                    // Direct translation succeeded, summarize in target language
                    const summaryResponse = await callAIWithFallback(env, config.SUMMARIZATION_MODELS, {
                        input_text: directTranslation
                    });
                    
                    const result = JSON.stringify({
                        summary: summaryResponse?.summary || directTranslation,
                        translated: directTranslation,
                        target_language: targetLang,
                        translation_method: "direct"
                    });

                    if (env.EDGESCRIBE_CACHE) {
                        context.waitUntil(env.EDGESCRIBE_CACHE.put(cacheKey, result, { 
                            expirationTtl: config.CACHE_TTL 
                        }));
                    }

                    return new Response(result, {
                        headers: {
                            "Content-Type": "application/json",
                            "X-Cache-Status": cacheStatus,
                            "X-Translation-Method": "direct",
                            ...CORS_HEADERS
                        }
                    });
                }

                // Fall back to English intermediate translation
                let englishText = text;
                if (sourceLang !== 'en') {
                    englishText = await translateWithProtectedWords(text, sourceLang, 'en', env, config);
                }

                // Generate summary in English
                const summaryResponse = await callAIWithFallback(env, config.SUMMARIZATION_MODELS, {
                    input_text: englishText
                });
                
                const summaryText = summaryResponse?.summary;
                if (!summaryText) {
                    throw new AIServiceError("Summarization failed to produce a valid response");
                }

                // Translate summary to target language
                let translatedText = summaryText;
                if (targetLang !== 'en') {
                    translatedText = await translateWithProtectedWords(summaryText, 'en', targetLang, env, config);
                }

                const result = JSON.stringify({
                    summary: summaryText,
                    translated: translatedText,
                    target_language: targetLang,
                    translation_method: "english_intermediate"
                });

                // Cache the result
                if (env.EDGESCRIBE_CACHE) {
                    context.waitUntil(env.EDGESCRIBE_CACHE.put(cacheKey, result, { 
                        expirationTtl: config.CACHE_TTL 
                    }));
                }

                return new Response(result, {
                    headers: {
                        "Content-Type": "application/json",
                        "X-Cache-Status": cacheStatus,
                        "X-Translation-Method": "english_intermediate",
                        ...CORS_HEADERS
                    }
                });
            }

            return new Response(JSON.stringify({ error: "Not Found" }), {
                status: 404,
                headers: {
                    "Content-Type": "application/json",
                    ...CORS_HEADERS
                }
            });

        } catch (err) {
            console.error("Request error:", err);
            
            let status = 500;
            let errorResponse = { error: "Internal Server Error" };
            
            if (err instanceof ValidationError) {
                status = 400;
                errorResponse = { error: err.message };
            } else if (err instanceof RateLimitError) {
                status = 429;
                errorResponse = { error: err.message, retry_after: 60 };
            } else if (err instanceof AIServiceError) {
                status = 503;
                errorResponse = { 
                    error: err.message, 
                    failed_model: err.model,
                    service_unavailable: true
                };
            } else if (err instanceof TranslationError) {
                status = 422;
                errorResponse = { 
                    error: err.message,
                    source_language: err.sourceLang,
                    target_language: err.targetLang
                };
            }
            
            return new Response(JSON.stringify(errorResponse), {
                status,
                headers: {
                    "Content-Type": "application/json",
                    ...CORS_HEADERS
                }
            });
        }
    }
};
