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

  let { data: memberships, error } = await supabase
    .from("studio_members")
    .select("studio_id, roles")
    .eq("user_id", authUser.id);

  if (error) {
    console.error("[StudioRoute] memberships query failed", error);
    return { redirected: false, reason: "query-error" };
  }

  let list = memberships || [];
  console.log("[StudioRoute] memberships count", list.length);

  if (list.length === 0) {
    if (!sessionStorage.getItem("invite_accept_attempted")) {
      console.log("[StudioRoute] memberships=0; trying acceptPendingInviteIfAny() before redirect");
      sessionStorage.setItem("invite_accept_attempted", "1");
      const inviteResult = await acceptPendingInviteIfAny();
      if (inviteResult?.accepted) {
        const retry = await supabase
          .from("studio_members")
          .select("studio_id, roles")
          .eq("user_id", authUser.id);
        if (!retry.error) {
          memberships = retry.data;
          list = memberships || [];
          console.log("[StudioRoute] memberships count", list.length);
        }
      }
    }
  }

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

  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) {
    console.error("[Invite] accept_invite failed", error);
    return { accepted: false, reason: "rpc-failed" };
  }
  if (!data?.ok) {
    if (data?.error === "email_mismatch") {
      alert("Invite email does not match this account.");
    }
    if (data?.error === "invite_expired") {
      alert("Invite has expired.");
    }
    return { accepted: false, reason: data?.error || "rpc-not-ok" };
  }

  localStorage.setItem("activeStudioId", data.studio_id);
  localStorage.setItem("activeStudioRoles", JSON.stringify(data.roles || []));
  localStorage.removeItem("pendingInviteToken");
  localStorage.removeItem("pendingInviteStudioId");
  localStorage.removeItem("pendingInviteEmail");
  localStorage.removeItem("pendingInviteRoleHint");

  return { accepted: true, studioId: data.studio_id, roles: data.roles || [] };
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
