// auth-callback.js
import { supabase } from "./supabaseClient.js";

const currentUrl = new URL(window.location.href);
const queryParams = currentUrl.searchParams;
const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));

const isRecoveryType = (value) => typeof value === "string" && value.toLowerCase() === "recovery";
const hasRecoveryFlag = isRecoveryType(queryParams.get("type")) || isRecoveryType(hashParams.get("type"));
const nextHint = (queryParams.get("next") || "").toLowerCase();
const shouldRouteToReset = hasRecoveryFlag || nextHint.includes("reset-password");

const redirectToReset = () => {
  const dest = `reset-password.html${currentUrl.search}${currentUrl.hash}`;
  window.location.replace(dest);
};

const redirectToHome = () => window.location.replace("index.html");
const redirectToLogin = () =>
  window.location.replace("login.html?flow=auth-callback&error=missing_session");

function waitForSession(timeout = 3000) {
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

async function handleAuthRedirect() {
  if (shouldRouteToReset) {
    return redirectToReset();
  }

  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      return redirectToHome();
    }
  } catch (error) {
    console.error("[Auth Callback] Session lookup failed:", error);
  }

  const eventSession = await waitForSession();
  if (eventSession?.session) {
    return redirectToHome();
  }

  redirectToLogin();
}

handleAuthRedirect();

/* Supabase Auth config reminder (update in dashboard):
   - Site URL: https://awards.milfordmusic.com
   - Redirect URLs:
     * https://awards.milfordmusic.com/auth-callback.html
     * https://awards.milfordmusic.com/reset-password.html
     * http://localhost:XXXX/auth-callback.html (for local dev testing of magic links)
*/
