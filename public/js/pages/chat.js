import { getSupabase } from "../supabase-client.js";
import { requireAuthenticatedSession } from "../auth-bootstrap.js";
import { postChatStream } from "../api.js";
import {
  initThemeToggle,
  setTheme,
  syncThemeToggleLabel,
} from "../theme.js";

const STORAGE_KEY = "study-helper-config-v1";
const WELCOME_DISMISS_KEY = "prepMind_welcome_dismissed";
const CHATS_STORAGE_PREFIX = "prepMind_chats_v1";

/** @typedef {{ role: "user" | "assistant"; text: string }} ChatMsg */
/** @typedef {{ id: string; title: string; updatedAt: number; messages: ChatMsg[] }} ChatDoc */
/** @typedef {{ activeId: string; chats: ChatDoc[] }} ChatsState */

async function main() {
  let supabase;
  try {
    supabase = await getSupabase();
  } catch {
    window.location.href = "/";
    return;
  }

  const initialSession = await requireAuthenticatedSession(supabase);
  if (!initialSession) {
    return;
  }

  const userId = initialSession.user.id;

  const themeToggleBtn = document.getElementById("themeToggle");
  const historySheet = document.getElementById("historySheet");
  const historySheetList = document.getElementById("historySheetList");
  const historySheetNewBtn = document.getElementById("historySheetNewBtn");
  const openHistoryBtn = document.getElementById("openHistoryBtn");
  const settingsModal = document.getElementById("settingsModal");
  const settingsFeedback = document.getElementById("settingsFeedback");
  const settingsDisplayName = document.getElementById("settingsDisplayName");
  const settingsSaveProfileBtn = document.getElementById("settingsSaveProfileBtn");
  const settingsUserEmail = document.getElementById("settingsUserEmail");
  const settingsNewEmail = document.getElementById("settingsNewEmail");
  const settingsChangeEmailBtn = document.getElementById("settingsChangeEmailBtn");
  const settingsNewPassword = document.getElementById("settingsNewPassword");
  const settingsConfirmPassword = document.getElementById("settingsConfirmPassword");
  const settingsChangePasswordBtn = document.getElementById(
    "settingsChangePasswordBtn"
  );
  const settingsThemeLight = document.getElementById("settingsThemeLight");
  const settingsThemeDark = document.getElementById("settingsThemeDark");
  const settingsCourseName = document.getElementById("settingsCourseName");
  const settingsResponseMode = document.getElementById("settingsResponseMode");
  const settingsAnalysisMode = document.getElementById("settingsAnalysisMode");
  const settingsSaveStudyBtn = document.getElementById("settingsSaveStudyBtn");
  const settingsSignOutBtn = document.getElementById("settingsSignOutBtn");
  const settingsClearChatsBtn = document.getElementById("settingsClearChatsBtn");
  const openSettingsBtn = document.getElementById("openSettingsBtn");

  const courseNameInput = document.getElementById("courseName");
  const analysisModeInput = document.getElementById("analysisMode");
  const responseModeInput = document.getElementById("responseMode");
  const pdfInput = document.getElementById("pdfFile");
  const pdfChipLabel = document.getElementById("pdfChipLabel");
  const messageInput = document.getElementById("messageInput");
  const saveConfigBtn = document.getElementById("saveConfigBtn");
  const runBtn = document.getElementById("runBtn");
  const statusEl = document.getElementById("status");
  const outputEl = document.getElementById("output");
  const quizArea = document.getElementById("quizArea");
  const chatStream = document.getElementById("chatStream");
  const chatMessagesEl = document.getElementById("chatMessages");
  const newChatBtn = document.getElementById("newChatBtn");
  const chatHistoryList = document.getElementById("chatHistoryList");
  const courseChipToggle = document.getElementById("courseChipToggle");
  const courseExpand = document.getElementById("courseExpand");
  const welcomeDismiss = document.getElementById("welcomeDismiss");
  const logoutBtn = document.getElementById("logoutBtn");

  /** @type {ChatsState} */
  let chatsState = { activeId: "", chats: [] };

  /** In-flight chat request; aborted on unload so refresh doesn’t look like a network error. */
  let activeChatAbort = null;
  /** Set as early as possible when the user navigates away / refreshes (before fetch may reject). */
  let pageLeavePending = false;
  /** Rotating “thinking” lines in the status pill. */
  let thinkingPhraseTimer = null;

  function markPageLeaveAndAbortChat() {
    pageLeavePending = true;
    try {
      activeChatAbort?.abort();
    } catch {
      /* ignore */
    }
  }

  window.addEventListener("beforeunload", markPageLeaveAndAbortChat, {
    capture: true,
  });
  window.addEventListener("pagehide", markPageLeaveAndAbortChat, {
    capture: true,
  });

  /** True when the chat fetch failed because of navigation/abort, not a real outage. */
  function isNavigationOrAbortError(err, signal) {
    if (signal?.aborted) return true;
    if (pageLeavePending) return true;
    if (!err) return false;
    if (err.name === "AbortError") return true;
    const cause = err.cause;
    if (cause && typeof cause === "object" && cause.name === "AbortError") {
      return true;
    }
    const msg = String(err.message || "");
    /* Chromium: navigation can reject with TypeError before/without AbortError. */
    if (err.name === "TypeError" && /failed to fetch|load failed/i.test(msg)) {
      return pageLeavePending || Boolean(signal?.aborted);
    }
    return false;
  }

  /**
   * Let `beforeunload` / `pagehide` run so `pageLeavePending` and `abort()` apply
   * before we treat the failure as a real network error.
   */
  function deferForUnloadDetection() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  function chatsStorageKey() {
    return `${CHATS_STORAGE_PREFIX}_${userId}`;
  }

  function defaultChatsState() {
    const id = crypto.randomUUID();
    return {
      activeId: id,
      chats: [
        { id, title: "New chat", updatedAt: Date.now(), messages: [] },
      ],
    };
  }

  /** @param {unknown} c */
  function normalizeChatDoc(c) {
    if (!c || typeof c !== "object") return null;
    const o = /** @type {Record<string, unknown>} */ (c);
    const id = typeof o.id === "string" ? o.id : crypto.randomUUID();
    const titleRaw = o.title;
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.slice(0, 80)
        : "New chat";
    const updatedAt =
      typeof o.updatedAt === "number" ? o.updatedAt : Date.now();
    const messages = [];
    if (Array.isArray(o.messages)) {
      for (const m of o.messages) {
        if (!m || typeof m !== "object") continue;
        const mo = /** @type {Record<string, unknown>} */ (m);
        const role = mo.role === "user" || mo.role === "assistant" ? mo.role : null;
        const text = typeof mo.text === "string" ? mo.text : "";
        if (role && text) messages.push({ role, text });
      }
    }
    return { id, title, updatedAt, messages };
  }

  function loadChatsState() {
    const raw = localStorage.getItem(chatsStorageKey());
    if (!raw) {
      chatsState = defaultChatsState();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        chatsState = defaultChatsState();
        return;
      }
      const p = /** @type {Record<string, unknown>} */ (parsed);
      const list = Array.isArray(p.chats) ? p.chats : [];
      const chats = [];
      for (const item of list) {
        const doc = normalizeChatDoc(item);
        if (doc) chats.push(doc);
      }
      if (chats.length === 0) {
        chatsState = defaultChatsState();
        return;
      }
      let activeId =
        typeof p.activeId === "string" ? p.activeId : chats[0].id;
      if (!chats.some((c) => c.id === activeId)) {
        activeId = chats[0].id;
      }
      chatsState = { activeId, chats };
    } catch {
      chatsState = defaultChatsState();
    }
  }

  function saveChatsState() {
    try {
      localStorage.setItem(chatsStorageKey(), JSON.stringify(chatsState));
    } catch {
      /* ignore quota */
    }
  }

  function getActiveChat() {
    return chatsState.chats.find((c) => c.id === chatsState.activeId) ?? null;
  }

  function syncWelcomeVisibility() {
    const el = document.getElementById("welcomeNotify");
    if (!el) return;
    const chat = getActiveChat();
    const hasMessages = Boolean(chat && chat.messages.length > 0);
    el.classList.toggle("welcome-pop--hidden", hasMessages);
  }

  const chatDateFmt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatChatWhen(ts) {
    try {
      return chatDateFmt.format(new Date(ts));
    } catch {
      return "";
    }
  }

  function previewFromChat(chat) {
    const last = chat.messages[chat.messages.length - 1];
    if (!last) return "No messages yet";
    let t = last.text.replace(/\s+/g, " ").trim();
    if (t.length > 120) t = `${t.slice(0, 117)}…`;
    return t;
  }

  function renderHistorySheetList() {
    if (!historySheetList) return;
    historySheetList.innerHTML = "";
    const sorted = [...chatsState.chats].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    for (const chat of sorted) {
      const n = chat.messages.length;
      const li = document.createElement("li");
      li.className = "chat-sheet__item";
      if (chat.id === chatsState.activeId) li.classList.add("is-active");

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "chat-sheet__open";
      openBtn.dataset.chatId = chat.id;

      const titleEl = document.createElement("span");
      titleEl.className = "chat-sheet__item-title";
      titleEl.textContent = chat.title;

      const meta = document.createElement("span");
      meta.className = "chat-sheet__item-meta";
      meta.textContent = `${formatChatWhen(chat.updatedAt)} · ${n} message${n === 1 ? "" : "s"}`;

      const preview = document.createElement("span");
      preview.className = "chat-sheet__item-preview";
      preview.textContent = previewFromChat(chat);

      openBtn.append(titleEl, meta, preview);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "chat-sheet__del";
      delBtn.dataset.action = "delete";
      delBtn.dataset.chatId = chat.id;
      delBtn.setAttribute("aria-label", "Delete conversation");
      delBtn.textContent = "×";

      li.append(openBtn, delBtn);
      historySheetList.appendChild(li);
    }
  }

  function renderHistoryList() {
    if (!chatHistoryList) return;
    chatHistoryList.innerHTML = "";
    const sorted = [...chatsState.chats].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    for (const chat of sorted) {
      const li = document.createElement("li");
      li.className = "chat-history-bar__row";
      if (chat.id === chatsState.activeId) {
        li.classList.add("is-active");
      }

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "chat-history-bar__open";
      openBtn.dataset.chatId = chat.id;
      const titleSpan = document.createElement("span");
      titleSpan.className = "chat-history-bar__title";
      titleSpan.textContent = chat.title;
      openBtn.appendChild(titleSpan);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "chat-history-bar__del";
      delBtn.dataset.action = "delete";
      delBtn.dataset.chatId = chat.id;
      delBtn.setAttribute("aria-label", "Delete conversation");
      delBtn.textContent = "×";

      li.append(openBtn, delBtn);
      chatHistoryList.appendChild(li);
    }
    renderHistorySheetList();
  }

  function updateOverlayBodyLock() {
    const historyOpen = historySheet && !historySheet.hidden;
    const settingsOpen = settingsModal && !settingsModal.hidden;
    document.body.classList.toggle(
      "chat-overlay-open",
      Boolean(historyOpen || settingsOpen)
    );
  }

  function openHistorySheet() {
    if (!historySheet) return;
    if (settingsModal) settingsModal.hidden = true;
    renderHistorySheetList();
    historySheet.hidden = false;
    updateOverlayBodyLock();
  }

  function closeHistorySheet() {
    if (!historySheet) return;
    historySheet.hidden = true;
    updateOverlayBodyLock();
  }

  function syncSettingsThemeSegments() {
    const dark = document.documentElement.dataset.theme === "dark";
    settingsThemeLight?.classList.toggle("is-selected", !dark);
    settingsThemeDark?.classList.toggle("is-selected", dark);
  }

  function setSettingsFeedback(message, variant = "idle") {
    if (!settingsFeedback) return;
    settingsFeedback.textContent = message || "";
    settingsFeedback.className = "chat-settings__feedback";
    if (variant === "success") {
      settingsFeedback.classList.add("chat-settings__feedback--success");
    } else if (variant === "error") {
      settingsFeedback.classList.add("chat-settings__feedback--error");
    }
  }

  function formatAuthError(error) {
    const code = error?.code;
    const raw = String(error?.message || "");
    if (code === "weak_password" || /weak/i.test(raw)) {
      return "Password is too weak. Use at least 8 characters.";
    }
    if (code === "same_password") {
      return "New password must be different from your current password.";
    }
    if (raw) return raw;
    return "Something went wrong. Try again.";
  }

  async function fillSettingsForm() {
    setSettingsFeedback("", "idle");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta =
      user && typeof user.user_metadata === "object"
        ? user.user_metadata
        : {};
    const fullName =
      typeof meta.full_name === "string" ? meta.full_name : "";
    if (settingsDisplayName) settingsDisplayName.value = fullName;
    if (settingsUserEmail) {
      settingsUserEmail.textContent = user?.email || "—";
    }
    if (settingsNewEmail) settingsNewEmail.value = "";
    if (settingsNewPassword) settingsNewPassword.value = "";
    if (settingsConfirmPassword) settingsConfirmPassword.value = "";
    if (settingsCourseName) settingsCourseName.value = courseNameInput.value;
    if (settingsResponseMode) {
      settingsResponseMode.value = responseModeInput.value;
    }
    if (settingsAnalysisMode) {
      settingsAnalysisMode.value = analysisModeInput.value;
    }
    syncSettingsThemeSegments();
  }

  async function openSettingsModal() {
    if (!settingsModal) return;
    if (historySheet) historySheet.hidden = true;
    await fillSettingsForm();
    settingsModal.hidden = false;
    updateOverlayBodyLock();
    settingsDisplayName?.focus();
  }

  function closeSettingsModal() {
    if (!settingsModal) return;
    settingsModal.hidden = true;
    updateOverlayBodyLock();
  }

  function applySettingsToComposer() {
    courseNameInput.value = settingsCourseName?.value ?? "";
    responseModeInput.value = settingsResponseMode?.value ?? "answer";
    analysisModeInput.value = settingsAnalysisMode?.value ?? "deep";
    if (courseNameInput.value.trim()) {
      setCourseExpanded(true);
    }
  }

  function clearAllConversations() {
    chatsState = defaultChatsState();
    saveChatsState();
    renderHistoryList();
    renderActiveMessages();
    syncWelcomeVisibility();
    setStatus("All conversations cleared", "done");
  }

  function appendBubble(container, role, text) {
    if (!container) return;
    const wrapper = document.createElement("div");
    wrapper.className = `msg ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    if (role === "assistant") {
      const html = parseMarkdownToHtml(text);
      if (html) {
        bubble.classList.add("msg-bubble--md");
        bubble.innerHTML = html;
      } else {
        bubble.textContent = text;
      }
    } else {
      bubble.textContent = text;
    }
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  /**
   * Live assistant reply: plain text while tokens arrive, then Markdown when complete.
   * @returns {{ append: (d: string) => void, finalize: () => string, discard: () => void }}
   */
  function createStreamingAssistantBubble() {
    const wrapper = document.createElement("div");
    wrapper.className = "msg assistant";
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble msg-bubble--streaming";
    wrapper.appendChild(bubble);
    chatMessagesEl.appendChild(wrapper);
    let acc = "";
    return {
      append(delta) {
        acc += delta;
        bubble.textContent = acc;
        chatStream.scrollTop = chatStream.scrollHeight;
      },
      /** When the server returns one JSON blob (no NDJSON), animate the text in for a live feel. */
      async typewriterFrom(fullText) {
        const s = String(fullText ?? "");
        acc = "";
        const step = Math.max(4, Math.min(32, Math.ceil(s.length / 400)));
        for (let i = 0; i < s.length; i += step) {
          acc = s.slice(0, Math.min(s.length, i + step));
          bubble.textContent = acc;
          chatStream.scrollTop = chatStream.scrollHeight;
          await new Promise((r) => requestAnimationFrame(r));
        }
        acc = s;
        bubble.textContent = acc;
      },
      finalize() {
        bubble.classList.remove("msg-bubble--streaming");
        const html = parseMarkdownToHtml(acc);
        if (html) {
          bubble.classList.add("msg-bubble--md");
          bubble.innerHTML = html;
        } else {
          bubble.textContent = acc;
        }
        return acc;
      },
      discard() {
        wrapper.remove();
      },
    };
  }

  /** Record assistant message in persisted chat state (DOM already updated). */
  function commitAssistantMessage(text) {
    const chat = getActiveChat();
    if (!chat) return;
    chat.messages.push({ role: "assistant", text });
    chat.updatedAt = Date.now();
    saveChatsState();
    renderHistoryList();
    syncWelcomeVisibility();
  }

  /**
   * @param {Response} response
   * @param {(delta: string) => void} onDelta
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<{ errorCode: string | null, fullText: string, usedPdfContext: boolean, aborted?: boolean }>}
   */
  async function readChatNdjsonStream(response, onDelta, signal) {
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        errorCode: "internal_error",
        fullText: "",
        usedPdfContext: false,
      };
    }
    const decoder = new TextDecoder();
    let buf = "";
    let fullText = "";
    let usedPdfContext = false;
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return {
          errorCode: null,
          fullText,
          usedPdfContext,
          aborted: true,
        };
      }
      let readResult;
      try {
        readResult = await reader.read();
      } catch (e) {
        if (
          signal?.aborted ||
          e?.name === "AbortError" ||
          pageLeavePending ||
          isNavigationOrAbortError(e, signal)
        ) {
          return {
            errorCode: null,
            fullText,
            usedPdfContext,
            aborted: true,
          };
        }
        throw e;
      }
      const { done, value } = readResult;
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const nl = buf.indexOf("\n");
        if (nl < 0) break;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.error) {
          return { errorCode: String(obj.error), fullText, usedPdfContext };
        }
        if (typeof obj.delta === "string" && obj.delta.length) {
          fullText += obj.delta;
          onDelta(obj.delta);
        }
        if (obj.done) {
          usedPdfContext = Boolean(obj.usedPdfContext);
        }
      }
    }
    return { errorCode: null, fullText, usedPdfContext, aborted: false };
  }

  function renderActiveMessages() {
    if (!chatMessagesEl) return;
    chatMessagesEl.innerHTML = "";
    const chat = getActiveChat();
    if (!chat) return;
    for (const m of chat.messages) {
      appendBubble(chatMessagesEl, m.role, m.text);
    }
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  function createNewChat() {
    const id = crypto.randomUUID();
    const doc = {
      id,
      title: "New chat",
      updatedAt: Date.now(),
      messages: [],
    };
    chatsState.chats.unshift(doc);
    chatsState.activeId = id;
    saveChatsState();
    renderHistoryList();
    renderActiveMessages();
    syncWelcomeVisibility();
    setStatus("Ready", "idle");
  }

  function switchChat(id) {
    if (id === chatsState.activeId) return;
    if (!chatsState.chats.some((c) => c.id === id)) return;
    chatsState.activeId = id;
    saveChatsState();
    renderHistoryList();
    renderActiveMessages();
    syncWelcomeVisibility();
  }

  function deleteChat(id) {
    if (chatsState.chats.length <= 1) {
      const only = chatsState.chats[0];
      if (only) {
        only.messages = [];
        only.title = "New chat";
        only.updatedAt = Date.now();
        chatsState.activeId = only.id;
        saveChatsState();
        renderHistoryList();
        renderActiveMessages();
        syncWelcomeVisibility();
      }
      return;
    }
    chatsState.chats = chatsState.chats.filter((c) => c.id !== id);
    if (chatsState.activeId === id) {
      chatsState.activeId = chatsState.chats[0].id;
    }
    saveChatsState();
    renderHistoryList();
    renderActiveMessages();
    syncWelcomeVisibility();
  }

  function initChats() {
    loadChatsState();
    renderHistoryList();
    renderActiveMessages();
    syncWelcomeVisibility();
  }

  function setStatus(text, state = "idle") {
    if (thinkingPhraseTimer) {
      clearInterval(thinkingPhraseTimer);
      thinkingPhraseTimer = null;
    }
    statusEl.dataset.state = state;

    if (state === "thinking") {
      const phrases = [
        "Reading your message",
        "Choosing the clearest explanation",
        "Getting your answer ready",
      ];
      let idx = 0;
      const paint = () => {
        const label = phrases[idx % phrases.length];
        idx += 1;
        statusEl.innerHTML = `<span class="status-pill__inner" role="status"><span class="status-pill__label">${label}</span><span class="status-pill__dots" aria-hidden="true"><span class="status-pill__dot"></span><span class="status-pill__dot"></span><span class="status-pill__dot"></span></span></span>`;
      };
      paint();
      thinkingPhraseTimer = setInterval(paint, 2300);
      return;
    }

    if (state === "writing") {
      statusEl.innerHTML = `<span class="status-pill__inner status-pill__inner--stream" role="status"><span class="status-pill__label">Composing your reply</span><span class="status-pill__shimmer" aria-hidden="true"></span></span>`;
      return;
    }

    statusEl.textContent = text ?? "";
    if (state === "error") {
      statusEl.dataset.state = "error";
    } else if (state === "done") {
      statusEl.dataset.state = "done";
    } else {
      statusEl.dataset.state = "idle";
    }
  }

  function parseMarkdownToHtml(text) {
    const m = globalThis.marked;
    if (!m || typeof text !== "string") return null;
    try {
      if (typeof m.parse === "function") {
        return m.parse(text, { breaks: true });
      }
      if (typeof m === "function") {
        return m(text);
      }
    } catch {
      return null;
    }
    return null;
  }

  /** Assistant replies are Markdown (`#` headings, lists, etc.); render with marked if loaded. */
  function addMessage(role, text) {
    const chat = getActiveChat();
    if (!chat) return;

    const userMsgCount = chat.messages.filter((m) => m.role === "user").length;
    chat.messages.push({ role, text });
    chat.updatedAt = Date.now();
    if (
      role === "user" &&
      userMsgCount === 0 &&
      typeof text === "string" &&
      text.trim()
    ) {
      const t = text.trim();
      chat.title = t.length > 48 ? `${t.slice(0, 48)}…` : t;
    }

    saveChatsState();
    appendBubble(chatMessagesEl, role, text);
    renderHistoryList();
    syncWelcomeVisibility();
  }

  function setCourseExpanded(open) {
    courseExpand.hidden = !open;
    courseChipToggle.setAttribute("aria-expanded", String(open));
  }

  function toggleCoursePanel() {
    setCourseExpanded(courseExpand.hidden);
  }

  function loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const config = JSON.parse(saved);
      courseNameInput.value = config.courseName || "";
      analysisModeInput.value = config.analysisMode || "deep";
      responseModeInput.value = config.responseMode || "answer";
      if (courseNameInput.value.trim()) {
        setCourseExpanded(true);
      }
    } catch (_) {
      setStatus("Saved preferences invalid. Reset and save again.", "error");
    }
  }

  function persistPreferences({ announceInChat = false } = {}) {
    const config = {
      courseName: courseNameInput.value.trim(),
      analysisMode: analysisModeInput.value,
      responseMode: responseModeInput.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setStatus("Preferences saved", "done");
    if (announceInChat) {
      addMessage("assistant", "Preferences saved.");
    }
  }

  function saveConfig() {
    persistPreferences({ announceInChat: true });
  }

  function updatePdfChipLabel() {
    const file = pdfInput.files?.[0];
    if (pdfChipLabel) {
      pdfChipLabel.textContent = file
        ? file.name.slice(0, 18) + (file.name.length > 18 ? "…" : "")
        : "PDF";
    }
  }

  async function sendChat() {
    const message = messageInput.value.trim();
    const courseName = courseNameInput.value.trim();
    const analysisMode = analysisModeInput.value;
    const responseMode = responseModeInput.value;
    const pdf = pdfInput.files?.[0];

    if (!message && !courseName && !pdf) {
      setStatus("Add a message, course, or PDF", "error");
      return;
    }

    pageLeavePending = false;

    if (message) {
      addMessage("user", message);
      messageInput.value = "";
    } else if (courseName) {
      addMessage("user", `Course: ${courseName}`);
    } else {
      addMessage("user", "Analyze this PDF.");
    }

    setStatus("", "thinking");
    runBtn.disabled = true;
    outputEl.style.display = "none";
    quizArea.style.display = "none";

    const formData = new FormData();
    if (pdf) {
      formData.append("pdf", pdf);
    }
    formData.append("message", message);
    formData.append("courseName", courseName);
    formData.append("analysisMode", analysisMode);
    formData.append("responseMode", responseMode);

    const chatAbort = new AbortController();
    activeChatAbort = chatAbort;
    let streamUi = null;

    function chatFailureMessage(status, code) {
      if (status === 503) {
        return "The study assistant isn’t available right now. Try again later.";
      }
      if (status === 400) {
        return "We couldn’t run that. Check your message or PDF and try again.";
      }
      if (status >= 500) {
        switch (code) {
          case "ai_not_configured":
            return "The AI isn’t set up on the server yet. Add ORIMISE_API_KEY and ORIMISE_BASE_URL (or ORIMISE_ENDPOINT) in the app’s .env file, set ORIMISE_MODEL to a model your provider supports, then restart the server.";
          case "ai_auth":
            return "The AI service rejected the API key. Check ORIMISE_API_KEY and your provider account.";
          case "ai_rate_limit":
            return "The AI service is limiting requests. Wait a few minutes or check your provider’s usage limits.";
          case "ai_upstream_failed":
            return "The AI didn’t return an answer. Confirm ORIMISE_MODEL matches a model your API actually offers, and try again.";
          case "ai_provider_error":
            return "The AI service (Orimise) hit an error on their side. Wait a moment and try again, switch model, or check Orimise status — your app is fine.";
          case "ai_network":
            return "Couldn’t reach the AI API (wrong URL or network issue). Check ORIMISE_BASE_URL or ORIMISE_ENDPOINT in .env.";
          case "internal_error":
            return "Something went wrong on the server. If it keeps happening, check Railway logs and your Orimise / model settings.";
          default:
            return "Something went wrong. Please try again.";
        }
      }
      return "Something went wrong. Please try again.";
    }

    try {
      const response = await postChatStream(formData, {
        signal: chatAbort.signal,
      });
      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        let data = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        if (response.status === 401) {
          if (message) {
            messageInput.value = message;
          }
          window.location.href = "/?auth=signin";
          return;
        }
        if (message) {
          messageInput.value = message;
        }
        const userMsg = chatFailureMessage(response.status, data.code);
        setStatus(userMsg, "error");
        addMessage("assistant", userMsg);
        return;
      }

      if (contentType.includes("application/x-ndjson")) {
        streamUi = createStreamingAssistantBubble();
        let sawDelta = false;
        const result = await readChatNdjsonStream(
          response,
          (delta) => {
            if (!sawDelta) {
              sawDelta = true;
              setStatus("", "writing");
            }
            streamUi.append(delta);
          },
          chatAbort.signal
        );

        if (result.aborted) {
          streamUi.discard();
          setStatus("Ready", "idle");
          return;
        }

        if (result.errorCode) {
          streamUi.discard();
          const userMsg = chatFailureMessage(500, result.errorCode);
          setStatus(userMsg, "error");
          addMessage("assistant", userMsg);
          return;
        }

        if (!result.fullText.trim()) {
          streamUi.discard();
          const userMsg = chatFailureMessage(500, "ai_upstream_failed");
          setStatus(userMsg, "error");
          addMessage("assistant", userMsg);
          return;
        }

        const finalText = streamUi.finalize();
        commitAssistantMessage(finalText);
        setStatus(
          result.usedPdfContext ? "Done — used PDF" : "Done",
          "done"
        );
        pdfInput.value = "";
        updatePdfChipLabel();
        return;
      }

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      const markdown = data.reply || "No response from AI.";
      streamUi = createStreamingAssistantBubble();
      setStatus("", "writing");
      await streamUi.typewriterFrom(markdown);
      const finalJson = streamUi.finalize();
      commitAssistantMessage(finalJson);
      setStatus(data.usedPdfContext ? "Done — used PDF" : "Done", "done");
      pdfInput.value = "";
      updatePdfChipLabel();
    } catch (err) {
      streamUi?.discard();
      await deferForUnloadDetection();
      if (isNavigationOrAbortError(err, chatAbort.signal)) {
        setStatus("Ready", "idle");
        return;
      }
      if (message) {
        messageInput.value = message;
      }
      const userMsg =
        "We couldn’t reach the server. Check your connection and try again.";
      setStatus(userMsg, "error");
      addMessage("assistant", userMsg);
    } finally {
      activeChatAbort = null;
      runBtn.disabled = false;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function initWelcomeDismiss() {
    const welcomeNotify = document.getElementById("welcomeNotify");
    if (!welcomeNotify || !welcomeDismiss) return;
    if (sessionStorage.getItem(WELCOME_DISMISS_KEY)) {
      welcomeNotify.remove();
      return;
    }
    welcomeDismiss.addEventListener("click", () => {
      welcomeNotify.classList.add("is-dismissed");
      sessionStorage.setItem(WELCOME_DISMISS_KEY, "1");
      setTimeout(() => {
        welcomeNotify.remove();
      }, 320);
    });
  }

  newChatBtn?.addEventListener("click", () => {
    createNewChat();
  });

  openHistoryBtn?.addEventListener("click", () => {
    openHistorySheet();
  });

  historySheet?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest("[data-close-sheet]")) {
      closeHistorySheet();
    }
  });

  historySheetNewBtn?.addEventListener("click", () => {
    createNewChat();
    closeHistorySheet();
  });

  historySheetList?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const delEl = t.closest("[data-action='delete']");
    if (delEl) {
      e.preventDefault();
      const id = delEl.dataset.chatId;
      if (id) deleteChat(id);
      return;
    }
    const openEl = t.closest("[data-chat-id]");
    if (openEl && !openEl.dataset.action) {
      const id = openEl.dataset.chatId;
      if (id) {
        switchChat(id);
        closeHistorySheet();
      }
    }
  });

  openSettingsBtn?.addEventListener("click", () => {
    void openSettingsModal();
  });

  settingsModal?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest("[data-close-settings]")) {
      closeSettingsModal();
    }
  });

  settingsSaveProfileBtn?.addEventListener("click", async () => {
    const name = settingsDisplayName?.value.trim() ?? "";
    setSettingsFeedback("Saving…", "idle");
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name || null },
    });
    if (error) {
      setSettingsFeedback(formatAuthError(error), "error");
      return;
    }
    setSettingsFeedback("Profile saved.", "success");
  });

  settingsChangeEmailBtn?.addEventListener("click", async () => {
    const next = settingsNewEmail?.value.trim() ?? "";
    if (!next) {
      setSettingsFeedback("Enter a new email address.", "error");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const current = user?.email?.toLowerCase() ?? "";
    if (current && next.toLowerCase() === current) {
      setSettingsFeedback("That’s already your email.", "error");
      return;
    }
    setSettingsFeedback("Sending confirmation…", "idle");
    const { error } = await supabase.auth.updateUser({ email: next });
    if (error) {
      setSettingsFeedback(formatAuthError(error), "error");
      return;
    }
    if (settingsNewEmail) settingsNewEmail.value = "";
    setSettingsFeedback(
      "Confirmation sent. Check your inbox (and spam) to verify the new email.",
      "success"
    );
  });

  settingsChangePasswordBtn?.addEventListener("click", async () => {
    const p1 = settingsNewPassword?.value ?? "";
    const p2 = settingsConfirmPassword?.value ?? "";
    if (p1.length < 8) {
      setSettingsFeedback("Password must be at least 8 characters.", "error");
      return;
    }
    if (p1 !== p2) {
      setSettingsFeedback("Passwords don’t match.", "error");
      return;
    }
    setSettingsFeedback("Updating password…", "idle");
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) {
      setSettingsFeedback(formatAuthError(error), "error");
      return;
    }
    if (settingsNewPassword) settingsNewPassword.value = "";
    if (settingsConfirmPassword) settingsConfirmPassword.value = "";
    setSettingsFeedback("Password updated.", "success");
  });

  settingsSaveStudyBtn?.addEventListener("click", () => {
    applySettingsToComposer();
    persistPreferences({ announceInChat: false });
    setSettingsFeedback("Study defaults saved.", "success");
  });

  settingsSignOutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  });

  settingsClearChatsBtn?.addEventListener("click", () => {
    if (
      !window.confirm(
        "Delete all conversations saved in this browser? This cannot be undone."
      )
    ) {
      return;
    }
    clearAllConversations();
    closeSettingsModal();
  });

  settingsThemeLight?.addEventListener("click", () => {
    setTheme("light");
    syncThemeToggleLabel(themeToggleBtn);
    syncSettingsThemeSegments();
    setSettingsFeedback("Theme set to light.", "success");
  });

  settingsThemeDark?.addEventListener("click", () => {
    setTheme("dark");
    syncThemeToggleLabel(themeToggleBtn);
    syncSettingsThemeSegments();
    setSettingsFeedback("Theme set to dark.", "success");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (settingsModal && !settingsModal.hidden) {
      closeSettingsModal();
      return;
    }
    if (historySheet && !historySheet.hidden) {
      closeHistorySheet();
    }
  });

  chatHistoryList?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const delEl = t.closest("[data-action='delete']");
    if (delEl) {
      e.preventDefault();
      const id = delEl.dataset.chatId;
      if (id) deleteChat(id);
      return;
    }
    const openEl = t.closest("[data-chat-id]");
    if (openEl && openEl.dataset.action !== "delete") {
      const id = openEl.dataset.chatId;
      if (id) switchChat(id);
    }
  });

  courseChipToggle.addEventListener("click", toggleCoursePanel);
  saveConfigBtn.addEventListener("click", saveConfig);
  runBtn.addEventListener("click", sendChat);
  pdfInput.addEventListener("change", updatePdfChipLabel);
  if (logoutBtn) {
    logoutBtn.hidden = false;
    logoutBtn.addEventListener("click", signOut);
  }
  initThemeToggle(themeToggleBtn);
  initWelcomeDismiss();
  initChats();

  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  });

  loadConfig();
  updatePdfChipLabel();
}

main();
