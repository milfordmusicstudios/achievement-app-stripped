import { supabase } from "./supabaseClient.js";

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
    const target = "settings.html";
    console.log("[StudioRoute] redirect target", target, "(placeholder)");
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
