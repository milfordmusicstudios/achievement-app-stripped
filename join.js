import { supabase } from "./supabaseClient.js";

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
  setText(statusEl, "Checking invite...");
  setText(detailsEl, "");

  if (!token) {
    setText(statusEl, "Paste an invite token to continue.");
    return;
  }

  const { data: invite, error } = await supabase
    .from("invites")
    .select("id, studio_id, role_hint, invited_email, status, expires_at")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (error || !invite) {
    setText(statusEl, "Invite not found or already used.");
    showError("This invite is not valid.");
    clearPendingInvite();
    return;
  }

  if (!invite.studio_id || !invite.role_hint) {
    setText(statusEl, "Invite is missing studio or role details.");
    showError("This invite is incomplete.");
    clearPendingInvite();
    return;
  }

  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  if (expiresAt && expiresAt <= new Date()) {
    setText(statusEl, "Invite has expired.");
    showError("This invite has expired.");
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
  const { data: studioRow, error: studioErr } = await supabase
    .from("studios")
    .select("name, slug")
    .eq("id", invite.studio_id)
    .single();

  if (!studioErr && studioRow?.name) {
    studioName = studioRow.slug ? `${studioRow.name} (${studioRow.slug})` : studioRow.name;
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

  const validateBtn = qs("validateBtn");
  if (validateBtn) {
    validateBtn.addEventListener("click", async () => {
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
