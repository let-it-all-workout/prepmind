function buildChatPrompt({
  message,
  courseName,
  responseMode,
  analysisMode,
  pdfContext,
}) {
  const modeRules = {
    answer:
      "Give a direct, clear answer with concise explanation and examples if useful.",
    study:
      "Return exam-focused notes with key concepts, important details, and memory tips.",
    quiz:
      "Return 5 tough exam-style questions with short model answers.",
  };

  return `
You are PrepMind AI, an expert exam tutor.
Be accurate, practical, and student-friendly.

Response mode: ${responseMode || "answer"}
Depth: ${analysisMode || "balanced"}
Rule: ${modeRules[responseMode] || modeRules.answer}

If context is incomplete, state assumptions briefly.
When suitable, structure output in markdown headings and bullets.

Student message:
${message || "(no direct message provided)"}

Course name context:
${courseName || "(not provided)"}

PDF context (optional):
${pdfContext || "(not provided)"}
  `.trim();
}

module.exports = { buildChatPrompt };
