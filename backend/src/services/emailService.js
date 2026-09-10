const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const logger = require('../utils/logger');

function createTransporter() {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

async function sendJobApplication({ to, subject, htmlBody, resumePath, coverLetterPath }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email credentials not configured. Set EMAIL_USER and EMAIL_PASS in .env');
  }

  const transporter = createTransporter();

  const attachments = [];

  if (resumePath && fs.existsSync(resumePath)) {
    const ext = path.extname(resumePath).toLowerCase();
    const isPdf = ext === '.pdf';
    attachments.push({
      filename: isPdf ? 'Resume_Praveen_Kumar.pdf' : 'Resume_Praveen_Kumar.docx',
      path: resumePath,
      contentType: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }

  if (coverLetterPath && fs.existsSync(coverLetterPath)) {
    attachments.push({
      filename: 'Cover_Letter.pdf',
      path: coverLetterPath,
      contentType: 'application/pdf'
    });
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html: htmlBody,
    attachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info('Email sent', { messageId: info.messageId, to });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Email send failed', { error: err.message, to });
    throw new Error(`Email send failed: ${err.message}`);
  }
}

async function verifyEmailConfig() {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

module.exports = { sendJobApplication, verifyEmailConfig };
