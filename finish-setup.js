import { supabase } from "./supabaseClient.js";
import { ensureUserRow } from "./utils.js";
import { ensureStudioContextAndRoute } from "./studio-routing.js";

function showError(message) {
  const errorEl = document.getElementById("finishSetupError");
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function clearError() {
  const errorEl = document.getElementById("finishSetupError");
  if (!errorEl) return;
  errorEl.textContent = "";
  errorEl.style.display = "none";
}

document.addEventListener("DOMContentLoaded", async () => {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData?.session?.user) {
    window.location.href = "login.html";
    return;
  }

  const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
  if (routeResult?.redirected) return;

  const activeStudioId = localStorage.getItem("activeStudioId");
  if (!activeStudioId) {
    window.location.href = "select-studio.html";
    return;
  }

  const profile = await ensureUserRow();
  if (!profile) {
    console.error("[FinishSetup] failed to load profile");
    window.location.href = "login.html";
    return;
  }

  console.log("[FinishSetup] loaded profile", profile.id);

  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const form = document.getElementById("finishSetupForm");
  const logoutBtn = document.getElementById("logoutBtn");

  if (firstNameInput) firstNameInput.value = profile.firstName || "";
  if (lastNameInput) lastNameInput.value = profile.lastName || "";

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();

      const firstName = (firstNameInput?.value || "").trim();
      const lastName = (lastNameInput?.value || "").trim();

      if (!firstName || !lastName) {
        showError("First and last name are required.");
        return;
      }

      const { error: updateErr } = await supabase
        .from("users")
        .update({ firstName, lastName })
        .eq("id", profile.id);

      if (updateErr) {
        console.error("[FinishSetup] save failed", updateErr);
        showError(updateErr.message || "Failed to save profile.");
        return;
      }

      const { data: refreshed, error: refreshErr } = await supabase
        .from("users")
        .select("*")
        .eq("id", profile.id)
        .single();

      if (refreshErr) {
        console.error("[FinishSetup] reload failed", refreshErr);
        showError(refreshErr.message || "Failed to reload profile.");
        return;
      }

      localStorage.setItem("loggedInUser", JSON.stringify(refreshed));
      console.log("[FinishSetup] saved", refreshed.id);
      window.location.href = "index.html";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      localStorage.removeItem("loggedInUser");
      localStorage.removeItem("activeStudioId");
      localStorage.removeItem("activeStudioRoles");
      window.location.href = "login.html";
    });
  }
});
