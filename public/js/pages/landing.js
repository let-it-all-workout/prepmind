import { getSupabase } from "../supabase-client.js";
import { redirectIfAuthenticated } from "../auth-bootstrap.js";
import { initThemeToggle } from "../theme.js";

let supabase = null;
try {
  supabase = await getSupabase();
} catch {
  const banner = document.getElementById("configError");
  if (banner) {
    banner.hidden = false;
    banner.textContent =
      "Sign-in isn’t available right now. Please try again later.";
  }
}

initThemeToggle(document.getElementById("themeToggle"));

const modalSignin = document.getElementById("modalSignin");
const modalSignup = document.getElementById("modalSignup");
const formSignin = document.getElementById("formSignin");
const formSignup = document.getElementById("formSignup");
const statusSignin = document.getElementById("statusSignin");
const statusSignup = document.getElementById("statusSignup");

function openModal(el) {
  if (!el) return;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-open"));
  document.body.classList.add("modal-open");
}

function closeModals() {
  [modalSignin, modalSignup].forEach((el) => {
    if (!el) return;
    el.classList.remove("is-open");
    el.hidden = true;
  });
  document.body.classList.remove("modal-open");
}

/** @param {boolean | "success"} [state] false = neutral, true = error, "success" = green */
function setStatus(el, text, state = false) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("error", "success");
  if (state === true) el.classList.add("error");
  else if (state === "success") el.classList.add("success");
}

/**
 * Short, non-technical messages only — never pass raw API text to users.
 * @param {"signin" | "signup"} context
 */
function friendlyAuthError(error, context = "signin") {
  const code = error?.code;
  const msg = String(error?.message || "").toLowerCase();

  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    /rate limit|too many requests/.test(msg)
  ) {
    return "Too many tries right now. Please wait a bit and try again.";
  }

  if (
    code === "invalid_credentials" ||
    msg.includes("invalid login credentials")
  ) {
    return "That email or password doesn’t match. Check them and try again.";
  }

  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "This user is still unconfirmed in Supabase. Turning off “Confirm email” doesn’t fix accounts created earlier — in Dashboard → Authentication → Users, confirm this email (or delete the user and sign up again). Or use the confirmation link from your inbox.";
  }

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("already registered") ||
    msg.includes("user already registered")
  ) {
    return context === "signup"
      ? "That email is already in use. Try signing in instead."
      : "That email or password doesn’t match. Check them and try again.";
  }

  if (code === "weak_password") {
    return "Use a stronger password (at least 8 characters).";
  }

  if (code === "signup_disabled") {
    return "New accounts can’t be created right now.";
  }

  if (code === "user_banned") {
    return "This account can’t sign in.";
  }

  if (code === "email_provider_disabled" || code === "provider_disabled") {
    return "Sign-in isn’t available right now. Try again later.";
  }

  return "Something went wrong. Please try again.";
}

function wireOpenSignin() {
  closeModals();
  openModal(modalSignin);
}

function wireOpenSignup() {
  closeModals();
  openModal(modalSignup);
}

["btnSignin", "btnSigninHero", "btnSigninBand"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", wireOpenSignin);
});
["btnSignup", "btnSignupHero", "btnSignupBand"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", wireOpenSignup);
});

document.getElementById("linkToSignup")?.addEventListener("click", () => {
  closeModals();
  openModal(modalSignup);
});
document.getElementById("linkToSignin")?.addEventListener("click", () => {
  closeModals();
  openModal(modalSignin);
});

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", closeModals);
});

modalSignin?.addEventListener("click", (e) => {
  if (e.target === modalSignin) closeModals();
});
modalSignup?.addEventListener("click", (e) => {
  if (e.target === modalSignup) closeModals();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModals();
});

document.querySelectorAll(".auth-password-wrap").forEach((wrap) => {
  const input = wrap.querySelector("input");
  const btn = wrap.querySelector(".auth-password-toggle");
  if (!input || !btn) return;
  btn.addEventListener("click", () => {
    const showPlain = input.type === "password";
    input.type = showPlain ? "text" : "password";
    btn.textContent = showPlain ? "Hide" : "Show";
    btn.setAttribute(
      "aria-label",
      showPlain ? "Hide password" : "Show password"
    );
  });
});

function handleGoogleAuth(statusEl) {
  setStatus(
    statusEl,
    "Google sign-in is currently unavailable. Please use email and password instead.",
    true
  );
}

document.getElementById("btnGoogleSignin")?.addEventListener("click", () => {
  handleGoogleAuth(statusSignin);
});
document.getElementById("btnGoogleSignup")?.addEventListener("click", () => {
  handleGoogleAuth(statusSignup);
});

formSignin?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) {
    setStatus(
      statusSignin,
      "Sign-in isn’t available right now. Please try again later.",
      true
    );
    return;
  }
  setStatus(statusSignin, "Signing in…");
  const fd = new FormData(formSignin);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus(statusSignin, friendlyAuthError(error, "signin"), true);
    return;
  }
  window.location.href = "/chat";
});

formSignup?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) {
    setStatus(
      statusSignup,
      "Sign-up isn’t available right now. Please try again later.",
      true
    );
    return;
  }
  setStatus(statusSignup, "Creating account…");
  const fd = new FormData(formSignup);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const fullName = String(fd.get("name") || "").trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || undefined },
      emailRedirectTo: `${window.location.origin}/chat`,
    },
  });
  if (error) {
    setStatus(statusSignup, friendlyAuthError(error, "signup"), true);
    return;
  }
  if (data.session) {
    window.location.href = "/chat";
    return;
  }
  setStatus(
    statusSignup,
    "Success — check your email for a confirmation link to finish signing up, then sign in here.",
    "success"
  );
  const signupPassword = document.getElementById("signupPassword");
  if (signupPassword) signupPassword.value = "";
});

const params = new URLSearchParams(window.location.search);
const authParam = params.get("auth");
if (authParam === "signin") openModal(modalSignin);
if (authParam === "signup") openModal(modalSignup);

/** After UI is wired: send already-logged-in users to chat (can take a few seconds). */
if (supabase) {
  void redirectIfAuthenticated(supabase);
}
