/**
 * Turn markdown-ish study notes into plain text for PDF body.
 * @param {string} md
 */
export function markdownToPlainForPdf(md) {
  if (typeof md !== "string") return "";
  let t = md.replace(/\r\n/g, "\n");
  t = t.replace(/^######\s*(.*)$/gm, "$1\n");
  t = t.replace(/^#####\s*(.*)$/gm, "$1\n");
  t = t.replace(/^####\s*(.*)$/gm, "$1\n");
  t = t.replace(/^###\s*(.*)$/gm, "\n$1\n");
  t = t.replace(/^##\s*(.*)$/gm, "\n\n$1\n");
  t = t.replace(/^#\s*(.*)$/gm, "\n\n$1\n\n");
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  t = t.replace(/\*(.+?)\*/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^[\t ]*[-*+]\s+/gm, "• ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * @param {string} markdown
 * @param {{ fileBase?: string; titleLine?: string }} [opts]
 */
export async function downloadStudyNotesPdf(markdown, opts = {}) {
  const plain = markdownToPlainForPdf(markdown);
  if (!plain) {
    throw new Error("Nothing to export.");
  }

  const { jsPDF } = await import(
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm"
  );

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const lineHeight = 14;
  const titleSize = 14;
  const bodySize = 11;
  const pageBottom = 820;
  const maxW = 515;

  let y = margin;

  const title = opts.titleLine || "PrepMind — Study notes";
  doc.setFontSize(titleSize);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(title, maxW);
  for (const line of titleLines) {
    if (y > pageBottom) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight + 2;
  }

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  const sub =
    typeof opts.subtitle === "string" && opts.subtitle.trim()
      ? opts.subtitle.trim()
      : `Generated ${new Date().toLocaleString()}`;
  const subLines = doc.splitTextToSize(sub, maxW);
  doc.setTextColor(80, 80, 90);
  for (const line of subLines) {
    if (y > pageBottom) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }
  doc.setTextColor(0, 0, 0);
  y += 10;

  const bodyLines = doc.splitTextToSize(plain, maxW);
  for (let i = 0; i < bodyLines.length; i += 1) {
    if (y > pageBottom) {
      doc.addPage();
      y = margin;
    }
    doc.text(bodyLines[i], margin, y);
    y += lineHeight;
  }

  const base =
    opts.fileBase && String(opts.fileBase).trim()
      ? String(opts.fileBase).trim().replace(/[^\w\-]+/g, "-").slice(0, 60)
      : "prepmind-study-notes";
  doc.save(`${base}.pdf`);
}
