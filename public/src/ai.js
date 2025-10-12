// src/ai.js
import { AIServiceError } from './errors.js';

/**
 * NEW: Generates a high-quality, abstractive summary using the Llama 3 model.
 */
export async function summarizeWithLlama(text, env) {
  const prompt = `
Summarize the following text in a clear and concise manner. Your task is to capture all the essential points, key arguments, events, and conclusions from the entire text.

Do NOT just extract the first few sentences. Read and understand the whole text before generating the summary.

Here is the text:
---
${text}
---
Summary:`;

  console.log("Generating summary with Llama 3 model...");

  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      prompt: prompt,
      max_tokens: 350
    });

    const summary = aiResponse.response?.trim() || "";

    if (summary.length === 0) {
      console.error("Llama 3 model returned an empty summary.");
      return text.split(/[.!?]+/).slice(0, 3).join('. ').trim() + '.'; // Fallback
    }
    
    console.log("Successfully generated summary with Llama 3.");
    return summary;
  } catch (err) {
    console.error("Error calling Llama 3 model:", err);
    throw new AIServiceError("The AI summarization service failed.");
  }
}

/**
 * Translates text while ensuring certain words are not translated.
 */
export async function translateWithProtectedWords(text, targetLang, env) {
  const PROTECTED_WORDS = [ /* Your extensive list of protected words */ ];
  const protectedWordMap = new Map();
  let modifiedText = text;

  PROTECTED_WORDS.forEach((word, index) => {
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