const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const UPLOADS_DIR = process.env.UPLOADS_PATH ||
  path.join(__dirname, '../../uploads');
const TAILORED_DIR = path.join(UPLOADS_DIR, 'tailored');

if (!fs.existsSync(TAILORED_DIR)) {
  fs.mkdirSync(TAILORED_DIR, { recursive: true });
}

/**
 * Generate a professional PDF resume from plain text
 * Returns the output file path
 */
async function generateResumePDF(resumeText, fileName = 'resume') {
  const outPath = path.join(TAILORED_DIR, `${fileName}_${Date.now()}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
      info: { Title: 'Resume', Author: 'JobAI Platform' }
    });

    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const lines = resumeText.split('\n');
    let firstLine = true;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        doc.moveDown(0.4);
        continue;
      }

      // Detect name (first non-empty line)
      if (firstLine) {
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#1a3557').text(line, { align: 'center' });
        doc.moveDown(0.3);
        firstLine = false;
        continue;
      }

      // Detect section headers (ALL CAPS, short)
      const isHeader = /^[A-Z][A-Z\s&\/\-]{2,35}$/.test(line) && line.length <= 40 && !line.includes('@');
      // Detect bullets
      const isBullet = /^[•\-\*]/.test(line);
      // Detect email/phone/contact line
      const isContact = line.includes('@') || /^\+?\d[\d\s\-]{7,}$/.test(line);
      // Detect job title / company lines (bold-ish)
      const isBoldLine = /^(Full Stack|Software|Developer|Engineer|Intern|Manager|Lead|Senior|Junior)/.test(line);

      if (isHeader) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a3557').text(line.toUpperCase());
        // Underline
        const y = doc.y;
        doc.moveTo(60, y).lineTo(535, y).strokeColor('#1a3557').lineWidth(0.8).stroke();
        doc.moveDown(0.3);
      } else if (isContact) {
        doc.font('Helvetica').fontSize(9).fillColor('#475569').text(line, { align: 'center' });
      } else if (isBullet) {
        const text = line.replace(/^[•\-\*]\s*/, '');
        doc.font('Helvetica').fontSize(10).fillColor('#1e293b')
          .text(`• ${text}`, { indent: 12, lineGap: 2 });
      } else if (isBoldLine) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text(line);
      } else {
        doc.font('Helvetica').fontSize(10).fillColor('#334155').text(line, { lineGap: 1 });
      }
    }

    doc.end();

    stream.on('finish', () => {
      logger.info('PDF resume generated', { path: outPath });
      resolve(outPath);
    });
    stream.on('error', reject);
  });
}

/**
 * Generate a professional PDF cover letter
 */
async function generateCoverLetterPDF(coverLetterText, candidateName = '', companyName = '', role = '') {
  const fileName = `cover_letter_${companyName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
  const outPath = path.join(TAILORED_DIR, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: { Title: `Cover Letter — ${role} at ${companyName}`, Author: candidateName }
    });

    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // Header
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a3557').text(candidateName || 'Candidate', { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#475569').text(today, { align: 'right' });
    doc.moveDown(1.5);

    // Body
    const paragraphs = coverLetterText.split(/\n\n+/).filter(p => p.trim());
    for (const para of paragraphs) {
      const text = para.trim();
      if (!text) continue;

      // Detect salutation / closing lines
      const isSalutation = /^(Dear|To Whom|Sincerely|Best regards|Yours|Regards|Thank you)/i.test(text);

      if (isSalutation) {
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(11).fillColor('#1e293b').text(text);
        doc.moveDown(0.5);
      } else {
        doc.font('Helvetica').fontSize(11).fillColor('#334155').text(text, { lineGap: 4, paragraphGap: 6 });
        doc.moveDown(0.6);
      }
    }

    doc.end();
    stream.on('finish', () => {
      logger.info('Cover letter PDF generated', { path: outPath });
      resolve(outPath);
    });
    stream.on('error', reject);
  });
}

/**
 * Generate a tailored resume PDF (1-page optimised, tight margins)
 * Used by the Resume Tailor feature.
 * @param {string} resumeText - plain text resume
 * @param {string} userId     - owner user id (used in filename)
 * @returns {Promise<string>} absolute path to generated PDF
 */
async function generateTailoredResumePDF(resumeText, userId = 'user') {
  const safeId = String(userId).replace(/[^a-z0-9]/gi, '_');
  const fileName = `tailored_${safeId}_${Date.now()}.pdf`;
  const outPath = path.join(TAILORED_DIR, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      // Tight margins so content fits on one page
      margins: { top: 36, bottom: 36, left: 48, right: 48 },
      info: { Title: 'Tailored Resume', Author: 'JobAI Platform' },
      autoFirstPage: true,
    });

    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const lines = resumeText.split('\n');
    let firstLine = true;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        doc.moveDown(0.3);
        continue;
      }

      // Name — very first non-empty line
      if (firstLine) {
        doc.font('Helvetica-Bold').fontSize(17).fillColor('#1a3557').text(line, { align: 'center' });
        doc.moveDown(0.25);
        firstLine = false;
        continue;
      }

      const isHeader  = /^[A-Z][A-Z\s&\/\-]{2,35}$/.test(line) && line.length <= 40 && !line.includes('@');
      const isBullet  = /^[•\-\*]/.test(line);
      const isContact = line.includes('@') || /^\+?\d[\d\s\-]{7,}$/.test(line);
      const isBold    = /^(Full Stack|Software|Developer|Engineer|Intern|Manager|Lead|Senior|Junior)/.test(line);

      if (isHeader) {
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a3557').text(line.toUpperCase());
        const y = doc.y;
        doc.moveTo(48, y).lineTo(547, y).strokeColor('#1a3557').lineWidth(0.7).stroke();
        doc.moveDown(0.25);
      } else if (isContact) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(line, { align: 'center' });
      } else if (isBullet) {
        const text = line.replace(/^[•\-\*]\s*/, '');
        doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b')
          .text(`• ${text}`, { indent: 10, lineGap: 1.5 });
      } else if (isBold) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text(line);
      } else {
        doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(line, { lineGap: 1 });
      }
    }

    doc.end();
    stream.on('finish', () => {
      logger.info('Tailored resume PDF generated', { path: outPath });
      resolve(outPath);
    });
    stream.on('error', reject);
  });
}

module.exports = { generateResumePDF, generateCoverLetterPDF, generateTailoredResumePDF };
