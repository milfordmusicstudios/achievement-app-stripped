import { supabase } from "./supabaseClient.js";

const PUBLIC_PAGES = new Set([
  "",
  "login.html",
  "signup.html",
  "auth-callback.html",
  "reset-password.html",
]);

function getPageName() {
  const raw = window.location.pathname;
  const cleaned = raw.split("/").filter(Boolean);
  return cleaned.length === 0 ? "index.html" : cleaned[cleaned.length - 1];
}

function waitForSession(timeout = 2500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      subscription?.unsubscribe?.();
      resolve(null);
    }, timeout);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timer);
      subscription?.unsubscribe?.();
      resolve(session);
    });
  });
}

function redirectToLogin() {
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const nextParam = encodeURIComponent(target);
  window.location.replace(`login.html?next=${nextParam}&flow=guard`);
}

async function forceReauth() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.error("[Auth Guard] Forced sign-out failed:", error);
  }
  redirectToLogin();
}

async function ensureSession() {
  const name = getPageName();
  if (PUBLIC_PAGES.has(name)) return;

  try {
    const currentSession = await supabase.auth.getSession();
    if (currentSession?.data?.session) return;

    const sessionViaEvent = await waitForSession();
    if (sessionViaEvent?.session) return;

    await forceReauth();
  } catch (error) {
    console.error("[Auth Guard] Session resolution failed:", error);
    await forceReauth();
  }
}

await ensureSession();
