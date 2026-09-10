const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const logger = require('../utils/logger');

const UPLOADS_DIR = process.env.UPLOADS_PATH ||
  path.join(__dirname, '../../uploads');
const TAILORED_DIR = path.join(UPLOADS_DIR, 'tailored');

if (!fs.existsSync(TAILORED_DIR)) {
  fs.mkdirSync(TAILORED_DIR, { recursive: true });
}

// pdf-parse needs to be required carefully
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  logger.warn('pdf-parse not loaded, PDF parsing unavailable');
}

/**
 * Parse resume file to plain text
 */
async function parseResumeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.pdf') {
      return await parsePdf(filePath);
    } else if (ext === '.docx' || ext === '.doc') {
      return await parseDocx(filePath);
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (err) {
    logger.error('Resume parsing error', { filePath, error: err.message });
    throw err;
  }
}

async function parsePdf(filePath) {
  if (!pdfParse) throw new Error('PDF parsing library not available');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text.trim();
}

async function parseDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  if (result.messages.length > 0) {
    logger.warn('DOCX parse warnings', { messages: result.messages });
  }
  return result.value.trim();
}

/**
 * Generate a tailored DOCX resume from text
 */
async function generateDocxFromText(resumeText, fileName = 'tailored_resume') {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');

  const lines = resumeText.split('\n').filter(l => l.trim());
  const children = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers (all caps, short)
    const isHeader = /^[A-Z\s&\/]{3,40}$/.test(trimmed) && trimmed.length < 40;
    // Detect bullet points
    const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
    // Detect name (first line, very short)
    const isName = children.length === 0 && trimmed.length < 50;

    if (isName) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: trimmed, bold: true, size: 40, font: 'Calibri' })],
        spacing: { after: 120 }
      }));
    } else if (isHeader) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: 24, font: 'Calibri', color: '1A3557' })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1A3557' } },
        spacing: { before: 240, after: 80 }
      }));
    } else if (isBullet) {
      children.push(new Paragraph({
        children: [new TextRun({ text: '  ' + trimmed, size: 20, font: 'Calibri' })],
        spacing: { before: 20, after: 20 }
      }));
    } else if (trimmed === '') {
      children.push(new Paragraph({ children: [], spacing: { before: 60 } }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, size: 20, font: 'Calibri' })],
        spacing: { before: 20, after: 20 }
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 900, right: 1080, bottom: 900, left: 1080 }
        }
      },
      children
    }]
  });

  const outputPath = path.join(TAILORED_DIR, `${fileName}_${Date.now()}.docx`);

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Generate a tailored DOCX resume (tight margins, named with userId)
 * Used by the Resume Tailor feature.
 * @param {string} resumeText - plain text resume
 * @param {string} userId     - owner user id (used in filename)
 * @returns {Promise<string>} absolute path to generated DOCX
 */
async function generateTailoredResumeDocx(resumeText, userId = 'user') {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = require('docx');

  const safeId = String(userId).replace(/[^a-z0-9]/gi, '_');
  const outputPath = path.join(TAILORED_DIR, `tailored_${safeId}_${Date.now()}.docx`);

  const lines = resumeText.split('\n').filter(l => l.trim());
  const children = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const isHeader  = /^[A-Z\s&\/]{3,40}$/.test(trimmed) && trimmed.length < 40;
    const isBullet  = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
    const isName    = children.length === 0 && trimmed.length < 50;

    if (isName) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: trimmed, bold: true, size: 34, font: 'Calibri' })],
        spacing: { after: 80 }
      }));
    } else if (isHeader) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: 22, font: 'Calibri', color: '1A3557' })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1A3557' } },
        spacing: { before: 200, after: 60 }
      }));
    } else if (isBullet) {
      children.push(new Paragraph({
        children: [new TextRun({ text: '  ' + trimmed, size: 19, font: 'Calibri' })],
        spacing: { before: 20, after: 20 }
      }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, size: 19, font: 'Calibri' })],
        spacing: { before: 20, after: 20 }
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          // Tight margins: ~0.5in top/bottom, ~0.6in left/right
          margin: { top: 720, right: 864, bottom: 720, left: 864 }
        }
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  logger.info('Tailored resume DOCX generated', { path: outputPath });
  return outputPath;
}

module.exports = { parseResumeFile, generateDocxFromText, generateTailoredResumeDocx };
