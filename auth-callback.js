import { supabase } from "./supabaseClient.js";

(async function () {
  try {
    // If your confirm-email link uses PKCE "code", this converts it into a session.
    if (typeof supabase.auth.exchangeCodeForSession === "function") {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) console.error("exchangeCodeForSession error:", error);
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) console.error("getSession error:", sessionErr);

    // After confirm, go to login so login.js can finalize pendingChildren
    window.location.replace("./login.html");
  } catch (e) {
    console.error("auth callback fatal:", e);
    window.location.replace("./login.html");
  }
})();
