import { authHeaders } from "./supabase-client.js";

/**
 * @param {FormData} formData
 * @returns {Promise<Response>}
 */
export async function postChat(formData) {
  const headers = await authHeaders();
  return fetch("/api/chat", {
    method: "POST",
    headers,
    body: formData,
  });
}

/**
 * Live token stream (NDJSON lines: `{ delta }`, then `{ done, usedPdfContext }`).
 * Pass `signal` to cancel on page unload so the client doesn’t treat it as a network failure.
 * @param {FormData} formData
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function postChatStream(formData, options = {}) {
  const { signal } = options;
  const headers = await authHeaders();
  return fetch("/api/chat?stream=1", {
    method: "POST",
    headers: {
      ...headers,
      Accept: "application/x-ndjson",
    },
    body: formData,
    signal,
  });
}
