import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let clientPromise;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch("/api/config");
      const data = await response.json();
      if (!response.ok || !data.supabaseUrl || !data.supabaseAnonKey) {
        throw new Error(
          data.error ||
            "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env."
        );
      }
      return createClient(data.supabaseUrl, data.supabaseAnonKey, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
        },
      });
    })();
  }
  return clientPromise;
}

/**
 * True when Supabase may still be exchanging PKCE / hash tokens (session not ready yet).
 */
function hasOAuthCallbackInUrl() {
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  try {
    if (new URLSearchParams(search).has("code")) return true;
  } catch (_) {
    /* ignore */
  }
  return (
    hash.includes("access_token") ||
    hash.includes("code=") ||
    /[?&#]code=/.test(`${search}${hash}`)
  );
}

/**
 * Wait until GoTrue has finished restoring the session (and PKCE/hash exchange if present).
 * Resolving INITIAL_SESSION with null *before* exchange caused /chat ↔ / redirect loops.
 */
export async function waitForInitialSession(supabase) {
  await supabase.auth.getSession();

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId;
    let subscription;

    const finish = (session) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      try {
        subscription?.unsubscribe();
      } catch (_) {
        /* ignore */
      }
      resolve(session ?? null);
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session) {
          finish(session);
          return;
        }
        if (hasOAuthCallbackInUrl()) {
          return;
        }
        void (async () => {
          const {
            data: { session: recovered },
          } = await supabase.auth.getSession();
          finish(recovered ?? null);
        })();
        return;
      }
      if (
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
        session
      ) {
        finish(session);
      }
    });
    subscription = data.subscription;

    timeoutId = setTimeout(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      finish(session);
    }, 4000);
  });
}

/** Call after OAuth redirect; same origin as Site URL in Supabase. */
export function oauthRedirectUrl() {
  return `${window.location.origin}/chat`;
}

/**
 * PKCE OAuth: navigate explicitly so redirect always runs (library auto-assign can be flaky in some cases).
 */
export async function signInWithGoogle(supabase) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: oauthRedirectUrl(),
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  const url = data?.url;
  if (!url) {
    throw new Error(
      "Google sign-in did not return a URL. In Supabase: Authentication → Providers → enable Google, and add this redirect URL: " +
        oauthRedirectUrl()
    );
  }
  window.location.assign(url);
}

export async function authHeaders() {
  const supabase = await getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
