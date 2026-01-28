// reset-password.js
import { supabase } from "./supabaseClient.js";

const form = document.getElementById("resetPasswordForm");
const statusEl = document.getElementById("statusMessage");

function updateStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = type;
}

function scrollToStatus() {
  statusEl?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleReset(event) {
  event.preventDefault();
  if (!form) return;

  const newPassword = document.getElementById("newPassword")?.value.trim() ?? "";
  const confirmPassword = document.getElementById("confirmPassword")?.value.trim() ?? "";

  if (newPassword.length < 8) {
    updateStatus("Password must be at least 8 characters long.", "error");
    scrollToStatus();
    return;
  }

  if (newPassword !== confirmPassword) {
    updateStatus("Passwords do not match.", "error");
    scrollToStatus();
    return;
  }

  updateStatus("Updating password…", "");
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      updateStatus(error.message || "Unable to set the new password.", "error");
      scrollToStatus();
      return;
    }

    updateStatus("Password updated. Redirecting to login…", "success");
    await supabase.auth.signOut();
    setTimeout(() => {
      window.location.replace("login.html?status=reset-success");
    }, 1200);
  } catch (error) {
    console.error("[Reset Password] Error", error);
    updateStatus("Something went wrong. Please try again.", "error");
    scrollToStatus();
  }
}

form?.addEventListener("submit", handleReset);
