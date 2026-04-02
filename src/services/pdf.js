const fs = require("fs/promises");
const pdfParse = require("pdf-parse");

async function extractPdfText(filePath) {
  const pdfBuffer = await fs.readFile(filePath);
  const parsed = await pdfParse(pdfBuffer);
  return parsed.text || "";
}

function chunkText(text, maxLength = 12000) {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks = [];
  let i = 0;

  while (i < clean.length) {
    const end = Math.min(i + maxLength, clean.length);
    chunks.push(clean.slice(i, end));
    i = end;
  }

  return chunks;
}

module.exports = { extractPdfText, chunkText };
