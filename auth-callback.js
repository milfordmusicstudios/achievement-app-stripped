import { supabase } from "./supabaseClient.js";
import { finalizePostAuth } from "./studio-routing.js";

(async function () {
  try {
    const token = new URLSearchParams(location.search).get("token");
    if (token) {
      localStorage.setItem("pendingInviteToken", token);
    }

    // If your confirm-email link uses PKCE "code", this converts it into a session.
    if (typeof supabase.auth.exchangeCodeForSession === "function") {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) console.error("exchangeCodeForSession error:", error);
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) console.error("getSession error:", sessionErr);

    if (sessionData?.session?.user) {
      await finalizePostAuth({ redirectHome: false });
      const tokenExists = Boolean(token || localStorage.getItem("pendingInviteToken"));
      const needsFinishSetup = localStorage.getItem("needsFinishSetup") === "1";
      const target = (tokenExists || needsFinishSetup)
        ? (tokenExists
          ? `./finish-setup.html?token=${encodeURIComponent(token || localStorage.getItem("pendingInviteToken"))}`
          : "./finish-setup.html")
        : "./index.html";
      console.log("[AuthCallback][Guard] session exists:", true, "token exists:", tokenExists, "needsFinishSetup:", needsFinishSetup, "redirect target:", target);
      window.location.replace(target);
      return;
    }

    // After confirm without a session, go to login
    window.location.replace("./login.html");
  } catch (e) {
    console.error("auth callback fatal:", e);
    window.location.replace("./login.html");
  }
})();
