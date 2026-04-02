import { waitForInitialSession } from "./supabase-client.js";

/**
 * Landing: if already signed in, go to chat.
 * @returns {Promise<boolean>} true if redirect was triggered
 */
export async function redirectIfAuthenticated(supabase) {
  const session = await waitForInitialSession(supabase);
  if (session) {
    window.location.replace("/chat");
    return true;
  }
  return false;
}

/** Chat app: require a session or send user to landing. */
export async function requireAuthenticatedSession(supabase) {
  const session = await waitForInitialSession(supabase);
  if (!session) {
    window.location.href = "/";
    return null;
  }
  return session;
}
