import { supabase } from "./supabaseClient.js";
import { finalizePostAuth } from "./studio-routing.js";

(async function () {
  try {
    const urlToken = new URLSearchParams(window.location.search).get("token");
    let tokenSource = "none";
    if (urlToken) {
      localStorage.setItem("pendingInviteToken", urlToken);
      tokenSource = "url";
    } else {
      const storedToken = localStorage.getItem("pendingInviteToken");
      if (storedToken) tokenSource = "storage";
    }
    console.log(`[AuthCallback] invite token source: ${tokenSource}`);

    // If your confirm-email link uses PKCE "code", this converts it into a session.
    if (typeof supabase.auth.exchangeCodeForSession === "function") {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) console.error("exchangeCodeForSession error:", error);
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) console.error("getSession error:", sessionErr);

    if (sessionData?.session?.user) {
      const result = await finalizePostAuth({ redirectHome: true });
      if (result?.inviteResult?.accepted || result?.routeResult?.redirected) return;
      window.location.href = "./welcome.html";
      return;
    }

    // After confirm without a session, go to login
    window.location.replace("./login.html");
  } catch (e) {
    console.error("auth callback fatal:", e);
    window.location.replace("./login.html");
  }
})();
