const fs = require("fs/promises");
const pdfParseModule = require("pdf-parse");

async function extractPdfText(filePath) {
  const pdfBuffer = await fs.readFile(filePath);
  /* pdf-parse v1: default export is (buffer) => Promise. v2+: PDFParse class. */
  if (typeof pdfParseModule === "function") {
    const parsed = await pdfParseModule(pdfBuffer);
    return parsed.text || "";
  }
  const { PDFParse } = pdfParseModule;
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    await parser.destroy();
  }
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
