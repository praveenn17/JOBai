const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || ''
);

// Primary model: fast and cheap. Fallback: slightly more capable.
// Override via .env: GEMINI_MODEL=gemini-2.5-flash
const PRIMARY_MODEL  = process.env.GEMINI_MODEL  || 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';

/**
 * Get a Gemini generative model instance.
 * @param {string} modelName - e.g. 'gemini-2.0-flash' or 'gemini-2.0-flash-lite'
 */
function getModel(modelName = PRIMARY_MODEL) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Generate text from a prompt string.
 * Automatically retries with the fallback model on 503 / model errors.
 * @param {string} prompt
 * @param {string} modelName
 * @returns {Promise<string>} plain text response
 */
async function generateText(prompt, modelName = PRIMARY_MODEL) {
  logger.info('Gemini generateText called', { model: modelName, promptLength: prompt.length });
  try {
    const model = getModel(modelName);
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    // Retry with fallback model on service errors (503) or wrong-model errors
    if (modelName !== FALLBACK_MODEL) {
      logger.warn(`Retrying with ${FALLBACK_MODEL} after error: ${err.message}`);
      const fallbackModel = getModel(FALLBACK_MODEL);
      const fallbackResult = await fallbackModel.generateContent(prompt);
      return fallbackResult.response.text();
    }
    throw err;
  }
}

module.exports = { getModel, generateText, generateContent: generateText };
