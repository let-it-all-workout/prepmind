function buildQuizPrompt(text, examFocus, questionCount = 8) {
  return `
You are an exam setter creating hard but fair questions from lecture notes.

Goal:
- Generate ${questionCount} questions based ONLY on source text.
- Prioritize difficult, exam-style understanding over easy recall.
- Mix formats: short answer, definition precision, scenario application, compare/contrast.

Constraints:
- Avoid ambiguous wording.
- Include expected key points for marking.
- If source is unclear, still ask but tag "needs_clarification": true.

Return STRICT JSON only with this schema:
{
  "course_brief": "2-4 lines about what this course is about",
  "real_life_use_case": "one concrete real world use",
  "questions": [
    {
      "id": "q1",
      "type": "short_answer",
      "question": "text",
      "expected_points": ["point1", "point2"],
      "max_score": 10,
      "needs_clarification": false
    }
  ]
}

Exam focus:
${examFocus || "General exam preparation"}

Source text:
${text}
  `.trim();
}

function buildQuizGradingPrompt(quiz, answers) {
  return `
You are grading a student's answers using the provided expected points.
Be strict and fair.

Return STRICT JSON only with this schema:
{
  "total_score": 0,
  "total_max_score": 0,
  "percentage": 0,
  "overall_feedback": "short paragraph",
  "results": [
    {
      "id": "q1",
      "score": 0,
      "max_score": 10,
      "correct_points_hit": ["..."],
      "missing_points": ["..."],
      "feedback": "..."
    }
  ]
}

Quiz:
${JSON.stringify(quiz)}

Student answers:
${JSON.stringify(answers)}
  `.trim();
}

module.exports = { buildQuizPrompt, buildQuizGradingPrompt };
