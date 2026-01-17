import { supabase } from "./supabaseClient.js";

function qs(id) {
  return document.getElementById(id);
}

function showMessage(el, message, isError) {
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  el.style.color = isError ? "#c62828" : "#0b7a3a";
}

async function getAuthUser() {
  const { data: authData } = await supabase.auth.getUser();
  return authData?.user || null;
}

async function loadStudios() {
  const select = qs("studioSelect");
  if (!select) return;
  select.innerHTML = "";

  const { data, error } = await supabase
    .from("studios")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    showMessage(qs("requestError"), error.message || "Failed to load studios.", true);
    return;
  }

  if (!data?.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No studios found";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  data.forEach(studio => {
    const opt = document.createElement("option");
    opt.value = studio.id;
    opt.textContent = studio.slug ? `${studio.name} (${studio.slug})` : studio.name;
    select.appendChild(opt);
  });
  select.disabled = false;
}

async function joinWithInvite(authUser) {
  const tokenInput = qs("inviteToken");
  const errorEl = qs("inviteError");
  const successEl = qs("inviteSuccess");
  if (!tokenInput) return;

  if (errorEl) errorEl.style.display = "none";
  if (successEl) successEl.style.display = "none";

  const token = (tokenInput.value || "").trim();
  if (!token) {
    showMessage(errorEl, "Please enter an invite token.", true);
    return;
  }

  const { data: invite, error } = await supabase
    .from("invites")
    .select("id, studio_id, role_hint, status, expires_at")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (error || !invite) {
    showMessage(errorEl, "Invite not found or already used.", true);
    return;
  }

  if (!invite.studio_id || !invite.role_hint) {
    showMessage(errorEl, "Invite is missing studio or role details.", true);
    return;
  }

  const now = new Date();
  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  if (expiresAt && expiresAt <= now) {
    showMessage(errorEl, "Invite has expired.", true);
    return;
  }

  const roles = [invite.role_hint];
  const { error: memberErr } = await supabase.from("studio_members").insert([
    {
      studio_id: invite.studio_id,
      user_id: authUser.id,
      roles,
      created_by: authUser.id
    }
  ]);

  if (memberErr) {
    showMessage(errorEl, memberErr.message || "Failed to join studio.", true);
    return;
  }

  const { error: inviteErr } = await supabase
    .from("invites")
    .update({
      status: "accepted",
      accepted_by: authUser.id,
      accepted_at: new Date().toISOString()
    })
    .eq("id", invite.id);

  if (inviteErr) {
    showMessage(errorEl, inviteErr.message || "Joined studio, but invite update failed.", true);
    return;
  }

  localStorage.setItem("activeStudioId", invite.studio_id);
  localStorage.setItem("activeStudioRoles", JSON.stringify(roles));
  showMessage(successEl, "Joined studio successfully.", false);
  window.location.href = "index.html";
}

async function requestAccess(authUser) {
  const studioSelect = qs("studioSelect");
  const noteInput = qs("requestNote");
  const errorEl = qs("requestError");
  const successEl = qs("requestSuccess");
  if (!studioSelect) return;

  if (errorEl) errorEl.style.display = "none";
  if (successEl) successEl.style.display = "none";

  const studioId = studioSelect.value;
  if (!studioId) {
    showMessage(errorEl, "Please select a studio.", true);
    return;
  }

  const note = (noteInput?.value || "").trim();
  const email = authUser.email || "";
  const message = note
    ? `Access request from ${email}: ${note}`
    : `Access request from ${email}.`;

  const { error } = await supabase.from("notifications").insert([
    {
      studio_id: studioId,
      type: "access_request",
      from_user_id: authUser.id,
      message,
      status: "unread"
    }
  ]);

  if (error) {
    showMessage(errorEl, error.message || "Failed to send request.", true);
    return;
  }

  showMessage(successEl, "Request sent. A studio admin will review it.", false);
  if (noteInput) noteInput.value = "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const authUser = await getAuthUser();
  if (!authUser?.id) {
    window.location.href = "login.html";
    return;
  }

  const tokenInput = qs("inviteToken");
  const urlToken = new URLSearchParams(window.location.search).get("token");
  if (tokenInput && urlToken) {
    tokenInput.value = urlToken;
  }

  await loadStudios();

  const joinBtn = qs("joinBtn");
  if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
      await joinWithInvite(authUser);
    });
  }

  const requestBtn = qs("requestBtn");
  if (requestBtn) {
    requestBtn.addEventListener("click", async () => {
      await requestAccess(authUser);
    });
  }

  const backBtn = qs("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "welcome.html";
    });
  }
});
