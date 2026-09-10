const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || ''
);

/**
 * Get a Gemini generative model instance.
 * @param {string} modelName - e.g. 'gemini-1.5-flash' or 'gemini-1.5-pro'
 */
function getModel(modelName = 'gemini-1.5-flash') {
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
async function generateText(prompt, modelName = 'gemini-1.5-flash') {
  const model = getModel(modelName);
  logger.info('Gemini generateText called', { model: modelName, promptLength: prompt.length });
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

module.exports = { getModel, generateText };
