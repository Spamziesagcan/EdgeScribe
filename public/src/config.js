// src/config.js

export const SUPPORTED_LANGUAGES = [ "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "tr", "el", "he", "th", "vi", "id", "ms", "tl", "sw", "am", "eu", "be", "bg", "bn", "hr", "ca" ];

export const CONFIG = { MAX_TEXT_LENGTH: 5000, CACHE_TTL: 3600, AI_TIMEOUT: 30000, RATE_LIMIT_PER_IP: 60 };

export const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" };