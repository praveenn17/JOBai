/**
 * Format Preservation Rules
 * Added to all resume generation and tailoring prompts.
 */

function getFormatPreservationRules(originalResumeText) {
  return `
FORMAT PRESERVATION RULES — MANDATORY:

1. DETECT the format of the original resume:
   - Single column or two column?
   - What order are sections in?
   - What style are headings? (ALL CAPS / Title Case / Bold)
   - What bullet style? (• / - / ◦ / numbers)
   - Does it have a header with contact info?
   - What section names does it use?
     (e.g. "Technical Skills" vs "Skills" vs "SKILLS")

2. REPLICATE that exact format:
   - Use the SAME section names as the original
   - Use the SAME heading style
   - Use the SAME bullet characters
   - Keep sections in the SAME ORDER as original
   - Keep the same contact info header format

3. CONTENT RULES:
   - Rewrite content only — never change the structure
   - No placeholder text like [Your Name], [Company],
     [Add your experience here]
   - No demo or sample data
   - No fictional companies, roles, or achievements
   - Every line must be based on real user data

4. ONE PAGE STRICT:
   - The final resume must fit on ONE page
   - Reduce font size mentally (8-10pt equivalent)
   - Use tight spacing
   - Keep bullets to 1 line each where possible
   - Abbreviate months (Jan, Feb...)
   - Cut non-relevant content to fit — never cut
     JD-relevant content

ORIGINAL RESUME FOR FORMAT REFERENCE:
${originalResumeText ? originalResumeText.substring(0, 800) : 'Not provided'}
`;
}

module.exports = { getFormatPreservationRules };
