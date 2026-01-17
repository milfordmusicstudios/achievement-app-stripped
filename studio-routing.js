import { supabase } from "./supabaseClient.js";
import { ensureUserRow } from "./utils.js";

function isCurrentPage(target) {
  const path = window.location.pathname || "";
  return path.endsWith(`/${target}`) || path.endsWith(`\\${target}`) || path.endsWith(target);
}

export async function ensureStudioContextAndRoute(options = {}) {
  const { redirectHome = true } = options;
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) return { redirected: false, reason: "no-auth" };

  const { data: memberships, error } = await supabase
    .from("studio_members")
    .select("studio_id, roles")
    .eq("user_id", authUser.id);

  if (error) {
    console.error("[StudioRoute] memberships query failed", error);
    return { redirected: false, reason: "query-error" };
  }

  const list = memberships || [];
  console.log("[StudioRoute] memberships count", list.length);

  if (list.length === 0) {
    const target = "welcome.html";
    console.log("[StudioRoute] redirect target", target);
    if (!isCurrentPage(target)) window.location.href = target;
    return { redirected: true, target };
  }

  if (list.length === 1) {
    const membership = list[0];
    localStorage.setItem("activeStudioId", membership.studio_id);
    localStorage.setItem("activeStudioRoles", JSON.stringify(membership.roles || []));
    console.log("[StudioRoute] chosen studio_id", membership.studio_id);
    const target = "index.html";
    console.log("[StudioRoute] redirect target", target);
    if (redirectHome && !isCurrentPage(target)) window.location.href = target;
    return { redirected: redirectHome, target };
  }

  const activeStudioId = localStorage.getItem("activeStudioId");
  const membershipIds = list.map(m => String(m.studio_id));
  const activeValid = activeStudioId && membershipIds.includes(String(activeStudioId));

  if (!activeValid) {
    const target = "select-studio.html";
    console.log("[StudioRoute] redirect target", target);
    if (!isCurrentPage(target)) window.location.href = target;
    return { redirected: true, target };
  }

  const activeMembership = list.find(m => String(m.studio_id) === String(activeStudioId));
  localStorage.setItem("activeStudioRoles", JSON.stringify(activeMembership?.roles || []));
  console.log("[StudioRoute] chosen studio_id", activeMembership?.studio_id || activeStudioId);
  return { redirected: false, target: null };
}

export async function acceptPendingInviteIfAny() {
  const token = localStorage.getItem("pendingInviteToken");
  if (!token) return { accepted: false, reason: "no-token" };

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) return { accepted: false, reason: "no-auth" };

  const { data: invite, error } = await supabase
    .from("invites")
    .select("id, studio_id, role_hint, invited_email, status, expires_at")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (error || !invite) {
    console.error("[Invite] lookup failed", error);
    return { accepted: false, reason: "not-found" };
  }

  if (!invite.studio_id) return { accepted: false, reason: "missing-studio" };

  const inviteEmail = String(invite.invited_email || "").toLowerCase();
  const authEmail = String(authUser.email || "").toLowerCase();
  if (!inviteEmail || inviteEmail !== authEmail) {
    alert("Invite email does not match this account.");
    return { accepted: false, reason: "email-mismatch" };
  }

  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  if (expiresAt && expiresAt <= new Date()) {
    alert("Invite has expired.");
    return { accepted: false, reason: "expired" };
  }

  const roles = [invite.role_hint || "student"];
  const { error: memberErr } = await supabase.from("studio_members").insert([
    {
      studio_id: invite.studio_id,
      user_id: authUser.id,
      roles,
      created_by: authUser.id
    }
  ]);

  if (memberErr) {
    console.error("[Invite] membership insert failed", memberErr);
    return { accepted: false, reason: "membership-failed" };
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
    console.error("[Invite] update failed", inviteErr);
    return { accepted: false, reason: "invite-update-failed" };
  }

  localStorage.setItem("activeStudioId", invite.studio_id);
  localStorage.setItem("activeStudioRoles", JSON.stringify(roles));
  localStorage.removeItem("pendingInviteToken");
  localStorage.removeItem("pendingInviteStudioId");
  localStorage.removeItem("pendingInviteEmail");
  localStorage.removeItem("pendingInviteRoleHint");

  return { accepted: true, studioId: invite.studio_id, roles };
}

export async function finalizePostAuth(options = {}) {
  const { redirectHome = true, ensureUser = true, storeProfile = true } = options;
  let ensured = null;
  if (ensureUser) {
    ensured = await ensureUserRow();
    if (storeProfile && ensured) {
      localStorage.setItem("loggedInUser", JSON.stringify(ensured));
    }
  }
  const inviteResult = await acceptPendingInviteIfAny();
  const routeResult = await ensureStudioContextAndRoute({ redirectHome });
  return { ensured, inviteResult, routeResult };
}
