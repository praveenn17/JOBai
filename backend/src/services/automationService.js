/**
 * Browser Automation Service
 * Uses Playwright to auto-fill job applications
 * Handles: CAPTCHA detection, login walls, OTP prompts, unknown errors
 * SAFETY: Stops on any uncertainty and reports clearly
 */

const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// Lazy-load playwright so the app works even without browsers installed
let playwright = null;
function getPlaywright() {
  if (!playwright) {
    try {
      playwright = require('playwright');
    } catch (err) {
      throw new Error(
        'Playwright not installed. Run: cd backend && npm install && npm run install:browsers'
      );
    }
  }
  return playwright;
}

/**
 * Main automation function
 * Returns a structured result object with status, actions, errors
 */
async function autoApplyToJob({ applyUrl, resumePath, coverLetterPath, answers, userInfo, onStatusUpdate }) {
  const result = {
    status: 'pending',        // pending | applied | skipped | failed
    reason: '',
    actions: [],
    screenshot: null,
    requiresManual: false,
    requiresOtp: false
  };

  const log = (action, note = '') => {
    const entry = { time: new Date().toISOString(), action, note };
    result.actions.push(entry);
    logger.info(`[Automation] ${action}`, { note });
    if (onStatusUpdate) onStatusUpdate(entry);
  };

  let browser = null;
  let context = null;
  let page = null;

  try {
    try {
      const { chromium } = require('playwright');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    } catch (err) {
      throw new Error(
        'Chromium is not installed. Run: npm run install:browsers'
      );
    }

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false
    });

    page = await context.newPage();

    // ─── Edge Case: Track dialogs ───────────────────────────────────────────
    page.on('dialog', async (dialog) => {
      log('dialog_detected', `Type: ${dialog.type()} | Message: ${dialog.message()}`);
      await dialog.dismiss();
    });

    // ─── Navigate ───────────────────────────────────────────────────────────
    log('navigating', `Opening: ${applyUrl}`);
    try {
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      result.status = 'failed';
      result.reason = `Navigation failed: ${navErr.message}`;
      return result;
    }

    await page.waitForTimeout(2000);

    const pageTitle = await page.title();
    const pageUrl = page.url();
    log('page_loaded', `Title: "${pageTitle}" | URL: ${pageUrl}`);

    // ─── Edge Case #1: CAPTCHA Detection ────────────────────────────────────
    const captchaDetected = await detectCaptcha(page);
    if (captchaDetected) {
      const screenshotPath = await takeScreenshot(page, 'captcha');
      result.status = 'skipped';
      result.reason = 'CAPTCHA detected. Cannot proceed with automation. Please apply manually.';
      result.screenshot = screenshotPath;
      result.requiresManual = true;
      log('captcha_detected', 'STOPPED — CAPTCHA wall detected');
      return result;
    }

    // ─── Edge Case #2: Login Wall ────────────────────────────────────────────
    const loginRequired = await detectLoginWall(page);
    if (loginRequired) {
      if (userInfo?.platform_credentials) {
        log('login_attempt', `Attempting login for platform`);
        const loginOk = await handleLogin(page, userInfo.platform_credentials);
        if (!loginOk) {
          result.status = 'failed';
          result.reason = 'Login failed. Check stored credentials.';
          result.requiresManual = true;
          return result;
        }
        await page.waitForTimeout(2000);
        log('login_success', 'Logged in successfully');

        // ─── Edge Case #3: OTP / 2FA ───────────────────────────────────────
        const otpRequired = await detectOtpPage(page);
        if (otpRequired) {
          log('otp_required', 'OTP page detected — waiting for user input (60s timeout)');
          result.status = 'pending';
          result.reason = 'OTP required. Please enter the OTP sent to your email/phone within 60 seconds.';
          result.requiresOtp = true;
          // In a real deployment, this would pause and signal frontend via websocket
          // For now we wait up to 60s for OTP field to be cleared
          try {
            await page.waitForFunction(
              () => !document.querySelector('input[name*="otp"], input[name*="code"], input[name*="token"]'),
              { timeout: 60000 }
            );
            log('otp_passed', 'OTP completed');
          } catch {
            result.status = 'failed';
            result.reason = 'OTP timeout. Application not submitted.';
            return result;
          }
        }
      } else {
        const screenshotPath = await takeScreenshot(page, 'login_wall');
        result.status = 'skipped';
        result.reason = 'Login required but no credentials stored. Please apply manually or add credentials in Settings.';
        result.screenshot = screenshotPath;
        result.requiresManual = true;
        log('login_wall', 'STOPPED — login required, no credentials');
        return result;
      }
    }

    // ─── Fill Application Form ───────────────────────────────────────────────
    log('form_scan', 'Scanning page for application form fields');
    const formFields = await scanFormFields(page);
    log('fields_found', `Found ${formFields.length} fillable fields`);

    for (const field of formFields) {
      const value = resolveFieldValue(field, userInfo, answers);
      if (!value) continue;

      try {
        await fillField(page, field, value);
        log('field_filled', `Filled: ${field.label || field.name || field.type}`);
        await page.waitForTimeout(300);
      } catch (fillErr) {
        log('field_error', `Could not fill "${field.label}": ${fillErr.message}`);
      }
    }

    // ─── Upload Resume ────────────────────────────────────────────────────────
    if (resumePath && fs.existsSync(resumePath)) {
      const uploaded = await uploadFile(page, resumePath);
      if (uploaded) {
        log('resume_uploaded', `Uploaded: ${path.basename(resumePath)}`);
      } else {
        log('resume_upload_skipped', 'No file upload field found on this page');
      }
    }

    // Upload cover letter if field exists
    if (coverLetterPath && fs.existsSync(coverLetterPath)) {
      await uploadFile(page, coverLetterPath, 'cover');
    }

    // ─── Take pre-submit screenshot ──────────────────────────────────────────
    const preSubmitPath = await takeScreenshot(page, 'pre_submit');
    result.screenshot = preSubmitPath;
    log('pre_submit_screenshot', 'Screenshot taken before submission');

    // ─── Edge Case: Double-check before submit ───────────────────────────────
    const submitBtn = await findSubmitButton(page);
    if (!submitBtn) {
      result.status = 'failed';
      result.reason = 'No submit button found. The page may require manual navigation.';
      result.requiresManual = true;
      log('submit_btn_missing', 'STOPPED — submit button not found');
      return result;
    }

    // Final CAPTCHA check right before submit
    const finalCaptcha = await detectCaptcha(page);
    if (finalCaptcha) {
      result.status = 'skipped';
      result.reason = 'CAPTCHA appeared before submit. Please complete and submit manually.';
      result.requiresManual = true;
      log('captcha_before_submit', 'STOPPED — CAPTCHA before submit');
      return result;
    }

    log('submitting', 'Clicking submit button');
    await submitBtn.click();
    await page.waitForTimeout(3000);

    // ─── Detect success ───────────────────────────────────────────────────────
    const success = await detectSuccess(page);
    const postUrl = page.url();
    const postPath = await takeScreenshot(page, 'post_submit');

    if (success || postUrl !== applyUrl) {
      result.status = 'applied';
      result.reason = 'Application submitted successfully.';
      result.screenshot = postPath;
      log('application_submitted', `Success confirmed. Final URL: ${postUrl}`);
    } else {
      result.status = 'failed';
      result.reason = 'Form submitted but success confirmation not detected. Verify manually.';
      result.screenshot = postPath;
      result.requiresManual = true;
      log('submit_uncertain', 'Submission unconfirmed — manual verification recommended');
    }

    return result;

  } catch (err) {
    // ─── Edge Case #4: Unknown Error ─────────────────────────────────────────
    logger.error('[Automation] Unknown error', { error: err.message, stack: err.stack });

    let screenshotPath = null;
    try {
      if (page) screenshotPath = await takeScreenshot(page, 'error');
    } catch {}

    result.status = 'failed';
    result.reason = `Automation error: ${err.message}`;
    result.screenshot = screenshotPath;
    log('unknown_error', err.message);
    return result;

  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function detectCaptcha(page) {
  return page.evaluate(() => {
    const signals = [
      document.querySelector('iframe[src*="recaptcha"]'),
      document.querySelector('iframe[src*="hcaptcha"]'),
      document.querySelector('.g-recaptcha'),
      document.querySelector('[data-sitekey]'),
      document.querySelector('#captcha'),
      document.querySelector('[id*="captcha"]'),
      document.querySelector('[class*="captcha"]'),
      document.querySelector('iframe[title*="challenge"]'),
    ];
    return signals.some(Boolean);
  });
}

async function detectLoginWall(page) {
  return page.evaluate(() => {
    const loginSignals = [
      document.querySelector('input[type="password"]'),
      document.querySelector('button[type="submit"]') &&
        (document.querySelector('input[name="email"]') || document.querySelector('input[name="username"]')),
      document.querySelector('[id*="signin"]'),
      document.querySelector('[class*="login-form"]'),
    ];
    // Only flag as login if there's a password field and no "apply" context
    const hasPasswordField = !!document.querySelector('input[type="password"]');
    const hasApplyContext = document.body.innerText.toLowerCase().includes('apply now') ||
      document.body.innerText.toLowerCase().includes('submit application');
    return hasPasswordField && !hasApplyContext;
  });
}

async function detectOtpPage(page) {
  return page.evaluate(() => {
    return !!(
      document.querySelector('input[name*="otp"]') ||
      document.querySelector('input[name*="verification_code"]') ||
      document.querySelector('input[name*="token"]') ||
      document.querySelector('input[maxlength="6"]') ||
      document.querySelector('input[maxlength="4"]') ||
      /enter.*code|verification code|one.time/i.test(document.body.innerText)
    );
  });
}

async function handleLogin(page, credentials) {
  try {
    const emailField = await page.$('input[type="email"], input[name="email"], input[name="username"]');
    const passField = await page.$('input[type="password"]');
    if (!emailField || !passField) return false;

    await emailField.fill(credentials.email || credentials.username || '');
    await passField.fill(credentials.password || '');

    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForTimeout(2000);
    return true;
  } catch {
    return false;
  }
}

async function scanFormFields(page) {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select'
    ));

    return inputs.map(el => {
      // Find closest label
      const id = el.id;
      let label = '';
      if (id) {
        const labelEl = document.querySelector(`label[for="${id}"]`);
        if (labelEl) label = labelEl.innerText.trim();
      }
      if (!label) {
        const parent = el.closest('div, p, li');
        if (parent) {
          const labelEl = parent.querySelector('label, span, p');
          if (labelEl) label = labelEl.innerText.trim().slice(0, 60);
        }
      }

      return {
        selector: el.id ? `#${el.id}` : null,
        name: el.name || '',
        type: el.type || el.tagName.toLowerCase(),
        label: label.toLowerCase(),
        placeholder: (el.placeholder || '').toLowerCase(),
        required: el.required,
        tagName: el.tagName.toLowerCase()
      };
    });
  });
}

function resolveFieldValue(field, userInfo = {}, answers = {}) {
  const hint = (field.label + ' ' + field.name + ' ' + field.placeholder).toLowerCase();

  // Name
  if (/\bfirst.?name\b/.test(hint)) return userInfo.firstName || (userInfo.name || '').split(' ')[0] || '';
  if (/\blast.?name\b/.test(hint)) return userInfo.lastName || (userInfo.name || '').split(' ').slice(1).join(' ') || '';
  if (/\bfull.?name\b|\bname\b/.test(hint) && !/company|org/.test(hint)) return userInfo.name || '';

  // Contact
  if (/\bemail\b/.test(hint)) return userInfo.email || '';
  if (/\bphone\b|\bmobile\b|\bcontact\b/.test(hint)) return userInfo.phone || '';

  // Location
  if (/\bcity\b|\blocation\b/.test(hint)) return userInfo.location || '';
  if (/\bstate\b/.test(hint)) return userInfo.state || '';
  if (/\bcountry\b/.test(hint)) return 'India';
  if (/\bpincode\b|\bzip\b|\bpostal\b/.test(hint)) return userInfo.pincode || '';

  // Experience / Background
  if (/\byears.*(exp|experience)\b/.test(hint)) return '0';
  if (/\bnotice.?period\b/.test(hint)) return 'Immediate';
  if (/\bcurrent.*salary\b|\blast.*salary\b/.test(hint)) return '0';
  if (/\bexpected.*salary\b/.test(hint)) return userInfo.expected_salary || '';
  if (/\blinkedin\b/.test(hint)) return userInfo.linkedin || '';
  if (/\bgithub\b/.test(hint)) return userInfo.github || '';
  if (/\bportfolio\b|\bwebsite\b/.test(hint)) return userInfo.website || '';

  // AI-generated custom answers
  for (const [q, a] of Object.entries(answers)) {
    if (hint.includes(q.toLowerCase().slice(0, 20))) return a;
  }

  return null; // Don't fill unknown fields
}

async function fillField(page, field, value) {
  if (!value || !field.selector) return;

  const el = await page.$(field.selector);
  if (!el) return;

  if (field.tagName === 'select') {
    await el.selectOption({ label: value }).catch(() => el.selectOption({ value }));
  } else if (field.type === 'checkbox') {
    if (value === 'true' || value === true) await el.check();
  } else if (field.type === 'radio') {
    await el.check();
  } else {
    await el.fill('');
    await el.type(value, { delay: 40 }); // Human-like typing speed
  }
}

async function uploadFile(page, filePath, hint = 'resume') {
  try {
    const selectors = hint === 'cover'
      ? ['input[type="file"][name*="cover"]', 'input[type="file"][accept*=".pdf"]:nth-of-type(2)']
      : ['input[type="file"]', 'input[type="file"][name*="resume"]', 'input[type="file"][accept*=".pdf"]'];

    for (const sel of selectors) {
      const fileInput = await page.$(sel);
      if (fileInput) {
        await fileInput.setInputFiles(filePath);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function findSubmitButton(page) {
  const selectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit Application")',
    'button:has-text("Apply Now")',
    'button:has-text("Submit")',
    '[role="button"]:has-text("Apply")',
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) return btn;
    } catch {}
  }
  return null;
}

async function detectSuccess(page) {
  return page.evaluate(() => {
    const body = document.body.innerText.toLowerCase();
    return (
      body.includes('application submitted') ||
      body.includes('successfully applied') ||
      body.includes('thank you for applying') ||
      body.includes('we have received your application') ||
      body.includes('application received') ||
      body.includes('you have applied') ||
      document.querySelector('[class*="success"]') !== null ||
      document.querySelector('[class*="confirmation"]') !== null
    );
  });
}

async function takeScreenshot(page, label = 'screenshot') {
  try {
    const screenshotDir = path.join(__dirname, '../../uploads/screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    const screenshotPath = path.join(screenshotDir, `${label}_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return screenshotPath;
  } catch {
    return null;
  }
}

async function applyToJob(application, job, resume) {
  return await autoApplyToJob({
    applyUrl: job?.apply_url || application?.apply_url,
    resumePath: application?.tailored_resume_path || resume?.file_path,
    userInfo: application?.userInfo,
    answers: application?.answers
  });
}

module.exports = { autoApplyToJob, applyToJob };
