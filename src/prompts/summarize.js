function buildChunkExtractionPrompt(text, examFocus, analysisMode) {
  const modeInstruction =
    analysisMode === "deep"
      ? "Go exhaustive. Prefer completeness over brevity."
      : "Be concise but do not omit important exam points.";

  return `
You are an elite exam analyst, not a casual summarizer.
Input is raw lecture PDF text.

Important rule:
- Never skip dense or "small-looking" details if they can appear in hard exams.
- ${modeInstruction}
- If uncertain, mark uncertainty instead of inventing facts.

Tasks:
1) Extract ALL exam-relevant points from this chunk:
   - definitions, formulas, laws, assumptions, edge cases, exceptions,
   - processes/steps, comparisons, pros/cons, and hidden constraints.
2) For each point, include:
   - "Why it matters in exam"
   - one brief source quote copied from chunk text
3) Identify likely trick/confusion areas examiners use.
4) Write hard questions (not easy recall), each with concise answer.
5) Add memory hooks for high-yield facts.
6) Add an "Ambiguities" list when wording in source is unclear.

Output format (strict markdown):
## Chunk Intelligence
### High-Yield Points
- Point:
  - Why it matters:
  - Source quote:

### Tricky / Confusable Areas
- ...

### Hard Practice Questions
1. Q (hard):
   A: ...

### Memory Hooks
- ...

### Ambiguities
- ...

Exam focus from student:
${examFocus || "General exam preparation"}

Source text:
${text}
  `.trim();
}

function buildFinalSynthesisPrompt(chunkInsights, examFocus, analysisMode) {
  const modeInstruction =
    analysisMode === "deep"
      ? "Maximize coverage, depth, and exam difficulty."
      : "Balance coverage with concise readability.";

  return `
You are producing a final exam battle-sheet from multiple chunk analyses.
This is for difficult exams where missing details causes failure.

Rules:
- Do not drop rare but testable details.
- Remove only true duplicates.
- Preserve accuracy and uncertainty markings.
- ${modeInstruction}

Return strict markdown with this structure:
## Final Exam Sheet
### Course Brief (2-4 lines)
- What this course is about:
- Main problems it teaches you to solve:
- Big picture in plain language:

### Real-Life Use Cases
- Use case:
  - Where used:
  - Why this course topic matters there:

### Core Knowledge Map
- ...

### High-Yield Details (Often Missed)
- ...

### Tricky Traps & Common Mistakes
- ...

### Hard Exam Drills
1. Q (hard):
   A:
   Why examiner asks this:

### Must Memorize Night-Before-Exam
- ...

### Source-Backed Clarifications Needed
- ...

Quality rules for the two new sections:
- "Course Brief" must be simple enough for a beginner and specific to this PDF.
- "Real-Life Use Cases" must be concrete, realistic, and tied to course concepts (not generic).

Exam focus:
${examFocus || "General exam preparation"}

Chunk analyses to merge:
${chunkInsights.join("\n\n")}
  `.trim();
}

module.exports = {
  buildChunkExtractionPrompt,
  buildFinalSynthesisPrompt,
};
