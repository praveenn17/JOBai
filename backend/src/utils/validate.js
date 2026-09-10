/**
 * Simple input validation helpers for route handlers
 */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function sanitizeText(text, maxLength = 50000) {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, maxLength);
}

/**
 * Validate jobs array for /jobs/analyze
 */
function validateJobsArray(jobs) {
  const errors = [];

  if (!Array.isArray(jobs)) {
    errors.push('jobs must be an array');
    return { valid: false, errors };
  }

  if (jobs.length === 0) errors.push('jobs array cannot be empty');
  if (jobs.length > 10) errors.push('maximum 10 jobs per request');

  jobs.forEach((job, i) => {
    if (!job.description || typeof job.description !== 'string' || job.description.trim().length < 50) {
      errors.push(`Job #${i + 1}: description must be at least 50 characters`);
    }
    if (job.apply_url && !isValidUrl(job.apply_url)) {
      errors.push(`Job #${i + 1}: apply_url is not a valid URL`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Middleware factory for body validation
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => !req.body[f]);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }
    next();
  };
}

module.exports = { isValidEmail, isValidUrl, sanitizeText, validateJobsArray, requireFields };
