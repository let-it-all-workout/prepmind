const { orimise } = require("../config");

function isPlaceholderUrl(url) {
  const u = String(url || "").trim();
  if (!u) return true;
  return /your-host|example\.com|YOUR_ORIMISE|changeme|placeholder/i.test(u);
}

function getChatCompletionsUrl() {
  const explicit = String(orimise.endpoint || "").trim();
  if (explicit && !isPlaceholderUrl(explicit)) {
    return explicit;
  }
  const base = String(orimise.baseUrl || "").trim().replace(/\/$/, "");
  if (!base || isPlaceholderUrl(base)) {
    return null;
  }
  let p = String(orimise.chatPath || "/chat/completions").trim();
  if (!p.startsWith("/")) {
    p = `/${p}`;
  }
  return `${base}${p}`;
}

function resolveModelName(raw, fallback) {
  const v = String(raw || "").trim();
  if (!v || /^your_default_model$/i.test(v)) return fallback;
  return v;
}

function getDefaultModelName() {
  return resolveModelName(orimise.defaultModel, "gpt-4o-mini");
}

/** OpenAI-style SSE may include `data: {"error":{...}}` with HTTP 200. */
function sseUpstreamErrorMessage(event) {
  if (!event || event.error == null) return null;
  const e = event.error;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const parts = [
      typeof e.message === "string" ? e.message : "",
      e.code != null ? String(e.code) : "",
      e.type != null ? String(e.type) : "",
      e.param != null ? String(e.param) : "",
    ].filter(Boolean);
    if (parts.length) return parts.join(" — ");
    try {
      return JSON.stringify(e).slice(0, 400);
    } catch {
      return "Upstream error";
    }
  }
  return String(e);
}

function logSseUpstreamError(event) {
  try {
    const s = JSON.stringify(event);
    // eslint-disable-next-line no-console
    console.error("[llm/sse-upstream]", s.length > 2500 ? `${s.slice(0, 2500)}…` : s);
  } catch {
    // eslint-disable-next-line no-console
    console.error("[llm/sse-upstream]", event);
  }
}

function resolveAiConfig(taskType, requestModel) {
  if (!orimise.apiKey) {
    throw new Error(
      "Backend AI config missing. Set ORIMISE_API_KEY in .env (from your Orimise dashboard)."
    );
  }

  const endpoint = getChatCompletionsUrl();
  if (!endpoint) {
    throw new Error(
      "Orimise URL missing. Set ORIMISE_BASE_URL (base URL from Orimise) or ORIMISE_ENDPOINT (full chat URL). Optional: ORIMISE_CHAT_PATH if the path is not /chat/completions."
    );
  }

  const fallback = getDefaultModelName();
  const taskDefaults = {
    study: resolveModelName(orimise.studyModel, fallback),
    quiz: resolveModelName(orimise.quizModel, fallback),
    grade: resolveModelName(orimise.gradeModel, fallback),
  };
  const model = requestModel || taskDefaults[taskType] || fallback;
  if (!model) {
    throw new Error(
      "Model missing. Set ORIMISE_MODEL or task models in .env, or send model in request."
    );
  }

  return {
    apiKey: orimise.apiKey,
    endpoint,
    model,
  };
}

async function callOrimiseApi({
  apiKey = orimise.apiKey,
  endpoint,
  model,
  prompt,
  temperature = 0.2,
}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature,
    }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }

    const apiMsg =
      data?.error?.message ||
      data?.message ||
      (rawText.length > 500 ? `${rawText.slice(0, 500)}…` : rawText);
    throw new Error(
      `LLM request failed (${response.status}): ${apiMsg || response.statusText}`
    );
  }

  const contentType = String(response.headers.get("content-type") || "");
  const rawText = await response.text();

  // Orimise returns `text/event-stream` (SSE) by default.
  // We need to assemble `choices[0].delta.content` chunks.
  if (contentType.includes("text/event-stream") || rawText.includes("data:")) {
    const chunks = [];

    for (const line of rawText.split(/\r?\n/)) {
      const trimmed = String(line || "").trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;

      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      const sseErr = sseUpstreamErrorMessage(event);
      if (sseErr) {
        logSseUpstreamError(event);
        throw new Error(`LLM request failed: ${sseErr}`);
      }

      const delta = event?.choices?.[0]?.delta;
      const piece = delta?.content;
      if (typeof piece === "string" && piece.length) {
        chunks.push(piece);
      }
    }

    const assembled = chunks.join("");
    if (!assembled) {
      throw new Error(
        "LLM returned no message content (streaming response had no text)."
      );
    }
    return assembled;
  }

  // Non-streaming JSON responses
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  const content =
    data?.choices?.[0]?.message?.content ??
    (typeof data?.content === "string" ? data.content : null);

  if (!content) {
    throw new Error(
      "LLM returned no message content (check model name and API format)."
    );
  }

  return content;
}

/**
 * Parse OpenAI-style SSE from a fetch Response body and yield `delta.content` strings.
 * @param {import('stream').Readable | ReadableStream} body
 */
async function* iterateSseDeltaChunks(body) {
  const stream =
    body && typeof body.getReader === "function"
      ? body
      : /** @type {ReadableStream} */ (body);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          yield* emitDeltaFromSseLine(line);
        }
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      yield* emitDeltaFromSseLine(line);
    }
  }
}

/** @param {string} line */
function* emitDeltaFromSseLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed.startsWith("data:")) return;
  const payload = trimmed.slice("data:".length).trim();
  if (!payload || payload === "[DONE]") return;
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return;
  }
  const sseErr = sseUpstreamErrorMessage(event);
  if (sseErr) {
    logSseUpstreamError(event);
    throw new Error(`LLM request failed: ${sseErr}`);
  }
  const piece = event?.choices?.[0]?.delta?.content;
  if (typeof piece === "string" && piece.length) {
    yield piece;
  }
}

/** Orimise sometimes returns SSE `{"error":{"type":"backend_error",...}}` while HTTP stays 200. */
function streamOrimiseBackendErrorRetryable(err) {
  const msg = String(err?.message || "");
  return (
    /backend_error/i.test(msg) ||
    (/LLM request failed/i.test(msg) && /internal server error/i.test(msg))
  );
}

/**
 * Single streaming attempt (no retry). Sends `stream: true` upstream.
 * Falls back to a single yield if the API returns JSON instead of SSE.
 */
async function* streamOrimiseChatOnce({
  apiKey = orimise.apiKey,
  endpoint,
  model,
  prompt,
  temperature = 0.2,
}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature,
      stream: true,
    }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    const apiMsg =
      data?.error?.message ||
      data?.message ||
      (rawText.length > 500 ? `${rawText.slice(0, 500)}…` : rawText);
    throw new Error(
      `LLM request failed (${response.status}): ${apiMsg || response.statusText}`
    );
  }

  const contentType = String(response.headers.get("content-type") || "");

  if (contentType.includes("application/json")) {
    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    const content =
      data?.choices?.[0]?.message?.content ??
      (typeof data?.content === "string" ? data.content : null);
    if (typeof content === "string" && content.length) {
      yield content;
    }
    return;
  }

  if (response.body && typeof response.body.getReader === "function") {
    yield* iterateSseDeltaChunks(response.body);
    return;
  }

  const buffered = await response.text();
  if (buffered.includes("data:")) {
    for (const line of buffered.split(/\r?\n/)) {
      yield* emitDeltaFromSseLine(line);
    }
    return;
  }

  throw new Error(
    "LLM returned no message content (streaming response had no text)."
  );
}

/**
 * Stream chat completion deltas (OpenAI-compatible).
 * If Orimise returns an in-stream `backend_error`, retry once without streaming.
 */
async function* streamOrimiseChat(params) {
  try {
    yield* streamOrimiseChatOnce(params);
  } catch (err) {
    if (!streamOrimiseBackendErrorRetryable(err)) throw err;
    // eslint-disable-next-line no-console
    console.warn(
      "[llm] stream failed (backend_error / internal); retrying non-stream once"
    );
    try {
      const text = await callOrimiseApi(params);
      if (text && String(text).length) {
        yield text;
        return;
      }
    } catch (err2) {
      throw err2;
    }
    throw err;
  }
}

module.exports = {
  callOrimiseApi,
  streamOrimiseChat,
  resolveAiConfig,
  getChatCompletionsUrl,
};
