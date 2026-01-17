import { supabase } from "./supabaseClient.js";

function toIsoPlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getActiveStudioRoles() {
  try {
    const raw = localStorage.getItem("activeStudioRoles");
    const roles = JSON.parse(raw || "[]");
    return Array.isArray(roles) ? roles : [];
  } catch {
    return [];
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function ensureAdmin(authUserId, studioId) {
  const cachedRoles = getActiveStudioRoles();
  if (cachedRoles.includes("admin")) return true;

  const { data, error } = await supabase
    .from("studio_members")
    .select("roles")
    .eq("user_id", authUserId)
    .eq("studio_id", studioId)
    .single();

  if (error) {
    console.error("[InviteStaff] admin check failed", error);
    return false;
  }

  const roles = Array.isArray(data?.roles) ? data.roles : [];
  return roles.includes("admin");
}

async function loadPendingInvites(studioId) {
  const container = document.getElementById("pendingInvites");
  if (!container) return;
  container.innerHTML = "";

  const { data, error } = await supabase
    .from("invites")
    .select("id, invited_email, role_hint, expires_at, token, status")
    .eq("studio_id", studioId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[InviteStaff] pending invites load failed", error);
    container.textContent = "Unable to load invites.";
    return;
  }

  if (!data || data.length === 0) {
    container.textContent = "No pending invites.";
    return;
  }

  data.forEach(invite => {
    const row = document.createElement("div");
    row.style.padding = "10px";
    row.style.background = "#fff";
    row.style.borderRadius = "12px";
    row.style.border = "1px solid rgba(11,79,138,0.18)";
    row.innerHTML = `
      <div><b>${invite.invited_email}</b> (${invite.role_hint || "role"})</div>
      <div style="font-size:12px; color:#555;">Expires: ${invite.expires_at ? new Date(invite.expires_at).toLocaleString() : "n/a"}</div>
      <div style="font-size:12px; margin-top:6px;">
        <a href="accept-invite.html?token=${invite.token}">accept-invite.html?token=${invite.token}</a>
      </div>
    `;
    container.appendChild(row);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("inviteForm");
  const emailInput = document.getElementById("inviteEmail");
  const roleInput = document.getElementById("inviteRole");
  const errorEl = document.getElementById("inviteError");
  const successEl = document.getElementById("inviteSuccess");
  const linkBox = document.getElementById("inviteLinkBox");
  const linkInput = document.getElementById("inviteLinkInput");
  const copyBtn = document.getElementById("copyInviteBtn");

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) {
    window.location.href = "login.html";
    return;
  }

  const studioId = localStorage.getItem("activeStudioId");
  if (!studioId) {
    window.location.href = "index.html";
    return;
  }

  console.log("[InviteStaff] studio id", studioId);

  const isAdmin = await ensureAdmin(authUser.id, studioId);
  if (!isAdmin) {
    window.location.href = "index.html";
    return;
  }

  await loadPendingInvites(studioId);

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      if (!linkInput?.value) return;
      try {
        await navigator.clipboard.writeText(linkInput.value);
        if (successEl) {
          successEl.textContent = "Invite link copied.";
          successEl.style.display = "block";
        }
      } catch (err) {
        console.error("[InviteStaff] copy failed", err);
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!emailInput || !roleInput) return;

      const email = normalizeEmail(emailInput.value);
      const role = roleInput.value;
      if (!email || !role) return;

      if (!crypto?.randomUUID) {
        if (errorEl) {
          errorEl.textContent = "Browser does not support invite token generation.";
          errorEl.style.display = "block";
        }
        return;
      }

      const token = crypto.randomUUID();
      const expiresAt = toIsoPlusDays(7);

      if (errorEl) errorEl.style.display = "none";
      if (successEl) successEl.style.display = "none";

      const { data, error } = await supabase.from("invites").insert([{
        studio_id: studioId,
        type: "studio_member",
        invited_email: email,
        role_hint: role,
        token,
        status: "pending",
        created_by: authUser.id,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
      }]).select("id").single();

      if (error) {
        console.error("[InviteStaff] insert failed", error);
        if (errorEl) {
          errorEl.textContent = error.message || "Failed to create invite.";
          errorEl.style.display = "block";
        }
        return;
      }

      console.log("[InviteStaff] inserted invite id", data?.id);
      const link = `accept-invite.html?token=${token}`;
      if (linkInput) linkInput.value = link;
      if (linkBox) linkBox.style.display = "block";
      if (successEl) {
        successEl.textContent = "Invite created.";
        successEl.style.display = "block";
      }

      emailInput.value = "";
      roleInput.value = "";

      await loadPendingInvites(studioId);
    });
  }
});
