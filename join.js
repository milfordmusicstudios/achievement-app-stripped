import { supabase } from "./supabaseClient.js";

console.log("[Join] join.js loaded");

function qs(id) {
  return document.getElementById(id);
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function showError(message) {
  const errorEl = qs("inviteError");
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function clearError() {
  const errorEl = qs("inviteError");
  if (!errorEl) return;
  errorEl.textContent = "";
  errorEl.style.display = "none";
}

function setAuthButtonsEnabled(enabled) {
  const loginBtn = qs("loginBtn");
  const signupBtn = qs("signupBtn");
  if (loginBtn) loginBtn.disabled = !enabled;
  if (signupBtn) signupBtn.disabled = !enabled;
}

function clearPendingInvite() {
  localStorage.removeItem("pendingInviteToken");
  localStorage.removeItem("pendingInviteStudioId");
  localStorage.removeItem("pendingInviteEmail");
  localStorage.removeItem("pendingInviteRoleHint");
}

async function validateInvite(token) {
  clearError();
  setAuthButtonsEnabled(false);

  const statusEl = qs("inviteStatus");
  const detailsEl = qs("inviteDetails");
  setText(statusEl, "Validating...");
  setText(detailsEl, "");

  if (!token) {
    setText(statusEl, "Paste an invite token to continue.");
    return;
  }
  console.log("[Join] validating token", token);

  const { data, error } = await supabase.rpc("validate_invite_token", { p_token: token });
  const invite = Array.isArray(data) ? data[0] : data;

  if (error || !invite) {
    setText(statusEl, "Invite not found, expired, or already used.");
    showError("We could not find a valid invite for this token.");
    clearPendingInvite();
    return;
  }

  if (!invite.studio_id || !invite.role_hint) {
    setText(statusEl, "Invite is missing studio or role details.");
    showError("This invite is incomplete.");
    clearPendingInvite();
    return;
  }

  localStorage.setItem("pendingInviteToken", token);
  localStorage.setItem("pendingInviteStudioId", invite.studio_id);
  if (invite.invited_email) {
    localStorage.setItem("pendingInviteEmail", invite.invited_email);
  }
  if (invite.role_hint) {
    localStorage.setItem("pendingInviteRoleHint", invite.role_hint);
  }

  let studioName = "";
  if (invite.studio_name) {
    studioName = invite.studio_slug ? `${invite.studio_name} (${invite.studio_slug})` : invite.studio_name;
  }

  setText(statusEl, "Invite validated.");
  if (studioName) {
    setText(detailsEl, `You are invited to ${studioName}.`);
  }
  setAuthButtonsEnabled(true);
}

document.addEventListener("DOMContentLoaded", async () => {
  const tokenInput = qs("inviteToken");
  const urlToken = new URLSearchParams(window.location.search).get("token");
  if (tokenInput && urlToken) {
    tokenInput.value = urlToken;
    await validateInvite(urlToken);
  }

  const validateBtn = qs("validateInviteBtn");
  if (validateBtn) {
    validateBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      const token = (tokenInput?.value || "").trim();
      await validateInvite(token);
    });
  }

  const loginBtn = qs("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      window.location.href = "login.html";
    });
  }

  const signupBtn = qs("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener("click", () => {
      window.location.href = "signup.html";
    });
  }

  const backBtn = qs("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "welcome.html";
    });
  }
});
