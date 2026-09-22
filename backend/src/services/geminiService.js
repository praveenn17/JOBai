const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || ''
);

/**
 * Get a Gemini generative model instance.
 * @param {string} modelName - e.g. 'gemini-1.5-flash' or 'gemini-1.5-pro'
 */
function getModel(modelName = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest') {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Generate text from a prompt string.
 * @param {string} prompt
 * @param {string} modelName
 * @returns {Promise<string>} plain text response
 */
async function generateText(prompt, modelName = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest') {
  logger.info('Gemini generateText called', { model: modelName, promptLength: prompt.length });
  try {
    const model = getModel(modelName);
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    if (modelName !== 'gemini-flash-latest') {
      logger.warn(`Retrying with gemini-flash-latest after error: ${err.message}`);
      const fallbackModel = getModel('gemini-flash-latest');
      const fallbackResult = await fallbackModel.generateContent(prompt);
      return fallbackResult.response.text();
    }
    throw err;
  }
}

module.exports = { getModel, generateText, generateContent: generateText };
