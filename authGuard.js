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
      unsubscribe();
      resolve(null);
    }, timeout);

    const unsubscribe = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(session);
    });
  });
}

function redirectToLogin() {
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const nextParam = encodeURIComponent(target);
  window.location.replace(`login.html?next=${nextParam}&flow=guard`);
}

async function ensureSession() {
  const name = getPageName();
  if (PUBLIC_PAGES.has(name)) return;

  const currentSession = await supabase.auth.getSession();
  if (currentSession?.session) return;

  const sessionViaEvent = await waitForSession();
  if (sessionViaEvent?.session) return;

  redirectToLogin();
}

await ensureSession();
