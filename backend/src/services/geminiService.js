const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || ''
);

// Confirmed working against this API key via live test (Sep 2026).
// gemini-3.8-flash and gemini-3.5-flash are overloaded/unavailable on this tier.
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

/**
 * Get a Gemini generative model instance.
 * @param {string} modelName
 */
function getModel(modelName = MODEL_NAME) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate text from a prompt string.
 * Retries up to 3 times on 503 Service Unavailable (temporary demand spike).
 * @param {string} prompt
 * @param {string} modelName
 * @returns {Promise<string>} plain text response
 */
async function generateText(prompt, modelName = MODEL_NAME) {
  logger.info('Gemini generateText called', { model: modelName, promptLength: prompt.length });

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = getModel(modelName);
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      const is503 = err.message && (
        err.message.includes('503') ||
        err.message.includes('Service Unavailable') ||
        err.message.includes('high demand')
      );

      if (is503 && attempt < MAX_RETRIES) {
        const waitMs = attempt * 2000; // 2s, 4s
        logger.warn(`Gemini 503 on attempt ${attempt}/${MAX_RETRIES} — retrying in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }

      // Not a 503, or exhausted retries — throw
      throw err;
    }
  }
}

module.exports = { getModel, generateText, generateContent: generateText };

