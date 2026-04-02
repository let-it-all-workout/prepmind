const express = require("express");
const fs = require("fs/promises");
const { supabaseUrl, supabaseAnonKey, supabaseAuth } = require("../config");
const { bearerToken, requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const { extractPdfText, chunkText } = require("../services/pdf");
const {
  callOrimiseApi,
  streamOrimiseChat,
  resolveAiConfig,
} = require("../services/llm");
const {
  buildChunkExtractionPrompt,
  buildFinalSynthesisPrompt,
} = require("../prompts/summarize");
const { buildQuizPrompt, buildQuizGradingPrompt } = require("../prompts/quiz");
const { buildChatPrompt } = require("../prompts/chat");
const { parseJsonFromModel } = require("../prompts/json");

const router = express.Router();

/** Split streamed text into small NDJSON chunks so the UI can update smoothly. */
function chunkUtf16(str, size) {
  if (!str) return [];
  const chars = [...str];
  const out = [];
  for (let i = 0; i < chars.length; i += size) {
    out.push(chars.slice(i, i + size).join(""));
  }
  return out;
}

/**
 * Map chat errors to stable codes for the client (never send raw upstream bodies).
 */
function chatErrorPayload(error) {
  const msg = String(error?.message || "");
  // eslint-disable-next-line no-console
  console.error("[api/chat]", error);

  if (/Backend AI config missing|Orimise URL missing|Model missing/i.test(msg)) {
    return { code: "ai_not_configured" };
  }

  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|getaddrinfo|network/i.test(msg)) {
    return { code: "ai_network" };
  }

  const llm = /LLM request failed \((\d+)\)/.exec(msg);
  if (llm) {
    const st = Number(llm[1]);
    if (st === 401 || st === 403) return { code: "ai_auth" };
    if (st === 429) return { code: "ai_rate_limit" };
    return { code: "ai_upstream_failed" };
  }

  if (/LLM returned no message content/i.test(msg)) {
    return { code: "ai_upstream_failed" };
  }

  return { code: "internal_error" };
}

router.get("/api/config", (req, res) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
      supabaseUrl: null,
      supabaseAnonKey: null,
    });
  }
  res.json({
    supabaseUrl,
    supabaseAnonKey,
  });
});

router.get("/api/auth/me", async (req, res) => {
  if (!supabaseAuth) {
    return res.status(503).json({ error: "Supabase not configured." });
  }
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated." });
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: "Invalid session." });
  }
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    },
  });
});

router.post(
  "/api/summarize",
  requireAuth,
  upload.single("pdf"),
  async (req, res) => {
    const filePath = req.file?.path;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No PDF file uploaded." });
      }

      const { model: requestModel, examFocus, analysisMode } = req.body;
      const aiConfig = resolveAiConfig("study", requestModel);

      const rawText = await extractPdfText(filePath);

      if (!rawText.trim()) {
        return res.status(400).json({
          error: "Could not extract text from this PDF.",
        });
      }

      const chunks = chunkText(rawText, 12000).slice(0, 6);
      const chunkInsights = [];

      for (let i = 0; i < chunks.length; i += 1) {
        const prompt = buildChunkExtractionPrompt(
          chunks[i],
          examFocus,
          analysisMode
        );
        const insight = await callOrimiseApi({
          ...aiConfig,
          prompt,
        });
        chunkInsights.push(`### Part ${i + 1}\n${insight}`);
      }

      const mergePrompt = buildFinalSynthesisPrompt(
        chunkInsights,
        examFocus,
        analysisMode
      );

      const finalSheet = await callOrimiseApi({
        ...aiConfig,
        prompt: mergePrompt,
        temperature: 0.1,
      });

      return res.json({
        extractedCharacters: rawText.length,
        processedChunks: chunks.length,
        analysisMode: analysisMode || "deep",
        result: finalSheet,
      });
    } catch (error) {
      return res.status(500).json({
        error: error.message || "Failed to summarize PDF.",
      });
    } finally {
      if (filePath) {
        fs.unlink(filePath).catch(() => {});
      }
    }
  }
);

router.post(
  "/api/quiz/generate",
  requireAuth,
  upload.single("pdf"),
  async (req, res) => {
    const filePath = req.file?.path;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No PDF file uploaded." });
      }

      const { model: requestModel, examFocus, questionCount } = req.body;
      const aiConfig = resolveAiConfig("quiz", requestModel);

      const rawText = await extractPdfText(filePath);
      if (!rawText.trim()) {
        return res.status(400).json({
          error: "Could not extract text from this PDF.",
        });
      }

      const sourceForQuiz = chunkText(rawText, 18000).slice(0, 2).join("\n");
      const prompt = buildQuizPrompt(
        sourceForQuiz,
        examFocus,
        Number(questionCount || 8)
      );

      const responseText = await callOrimiseApi({
        ...aiConfig,
        prompt,
        temperature: 0.3,
      });

      const quiz = parseJsonFromModel(responseText);
      if (!quiz || !Array.isArray(quiz.questions)) {
        return res.status(500).json({
          error: "Failed to parse quiz response from AI.",
        });
      }

      return res.json({
        extractedCharacters: rawText.length,
        quiz,
      });
    } catch (error) {
      return res.status(500).json({
        error: error.message || "Failed to generate quiz.",
      });
    } finally {
      if (filePath) {
        fs.unlink(filePath).catch(() => {});
      }
    }
  }
);

router.post("/api/quiz/grade", requireAuth, async (req, res) => {
  try {
    const { model: requestModel, quiz, answers } = req.body;
    const aiConfig = resolveAiConfig("grade", requestModel);

    if (!quiz || !Array.isArray(quiz.questions) || !Array.isArray(answers)) {
      return res.status(400).json({
        error: "quiz and answers are required.",
      });
    }

    const prompt = buildQuizGradingPrompt(quiz, answers);
    const responseText = await callOrimiseApi({
      ...aiConfig,
      prompt,
      temperature: 0.1,
    });

    const grading = parseJsonFromModel(responseText);
    if (!grading || !Array.isArray(grading.results)) {
      return res.status(500).json({
        error: "Failed to parse grading response from AI.",
      });
    }

    return res.json({
      grading,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to grade quiz.",
    });
  }
});

router.post(
  "/api/chat",
  requireAuth,
  upload.single("pdf"),
  async (req, res) => {
    const filePath = req.file?.path;
    const wantsStream =
      req.query.stream === "1" ||
      String(req.headers.accept || "").includes("application/x-ndjson");

    try {
      const {
        model: requestModel,
        message,
        courseName,
        responseMode,
        analysisMode,
      } = req.body;
      const aiConfig = resolveAiConfig("study", requestModel);

      if (!message && !courseName && !req.file) {
        return res.status(400).json({
          error: "Provide a message, courseName, or a PDF.",
        });
      }

      let pdfContext = "";
      if (req.file) {
        const rawText = await extractPdfText(filePath);
        pdfContext = chunkText(rawText, 20000).slice(0, 1).join("\n");
      }

      const prompt = buildChatPrompt({
        message,
        courseName,
        responseMode,
        analysisMode,
        pdfContext,
      });

      const temperature = responseMode === "quiz" ? 0.3 : 0.2;

      if (wantsStream) {
        res.status(200);
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        let assembled = "";
        try {
          for await (const delta of streamOrimiseChat({
            ...aiConfig,
            prompt,
            temperature,
          })) {
            assembled += delta;
            const pieces = chunkUtf16(delta, 32);
            for (let i = 0; i < pieces.length; i += 1) {
              res.write(JSON.stringify({ delta: pieces[i] }) + "\n");
              /* Yield the event loop so chunks flush to the browser instead of one blob. */
              if (pieces.length > 1 || pieces[i].length >= 32) {
                await new Promise((resolve) => setImmediate(resolve));
              }
            }
          }
          if (!assembled.trim()) {
            res.write(JSON.stringify({ error: "ai_upstream_failed" }) + "\n");
          } else {
            res.write(
              JSON.stringify({
                done: true,
                usedPdfContext: Boolean(pdfContext),
              }) + "\n"
            );
          }
        } catch (streamErr) {
          const { code } = chatErrorPayload(streamErr);
          res.write(JSON.stringify({ error: code }) + "\n");
        }
        res.end();
        return;
      }

      const reply = await callOrimiseApi({
        ...aiConfig,
        prompt,
        temperature,
      });

      return res.json({
        reply,
        usedPdfContext: Boolean(pdfContext),
      });
    } catch (error) {
      if (!res.headersSent) {
        const { code } = chatErrorPayload(error);
        return res.status(500).json({ code });
      }
    } finally {
      if (filePath) {
        fs.unlink(filePath).catch(() => {});
      }
    }
  }
);

module.exports = router;
