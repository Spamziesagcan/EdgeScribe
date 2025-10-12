// src/utils.js
import { CONFIG, SUPPORTED_LANGUAGES, CORS_HEADERS } from './config.js';
import { ValidationError, RateLimitError } from './errors.js';

export function validateInput(text, sourceLang, targetLang) {
  if (!text || typeof text !== "string" || text.trim().length === 0) throw new ValidationError("Text parameter is required and cannot be empty");
  if (text.length > CONFIG.MAX_TEXT_LENGTH) throw new ValidationError(`Text exceeds maximum length of ${CONFIG.MAX_TEXT_LENGTH} characters`);
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

export function sanitizeCacheKey(sourceLang, targetLang, text) {
  const textHash = hashString(text.substring(0, 100));
  return `translate:${sourceLang}:${targetLang}:${textHash}`;
}

const rateLimitStore = new Map();
export function checkRateLimit(ip) {
  const now = Date.now();
  const requests = rateLimitStore.get(ip) || [];
  const recentRequests = requests.filter((time) => time > (now - 60000));
  if (recentRequests.length >= CONFIG.RATE_LIMIT_PER_IP) {
    throw new RateLimitError("Rate limit exceeded. Please try again later.");
  }
  recentRequests.push(now);
  rateLimitStore.set(ip, recentRequests);
}

export function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") || "127.0.0.1";
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function handleHealthCheck() {
  return new Response(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

export function deduplicateSummary(summaryText) {
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