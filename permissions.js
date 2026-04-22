import { supabase } from "./supabaseClient.js";
import { getActiveStudioIdForUser, getAuthUserId } from "./utils.js";

function normalizeRoles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(role => String(role || "").toLowerCase());
}

async function resolveStudioAndUser(studioId) {
  const authUserId = await getAuthUserId();
  if (!authUserId) return { authUserId: null, studioId: null };
  const resolvedStudioId = studioId || await getActiveStudioIdForUser(authUserId);
  return { authUserId, studioId: resolvedStudioId || null };
}

export async function isAccountHolder(studioId) {
  const ctx = await resolveStudioAndUser(studioId);
  if (!ctx.authUserId || !ctx.studioId) return false;

  const { data, error } = await supabase
    .from("studios")
    .select("account_holder_user_id")
    .eq("id", ctx.studioId)
    .single();

  if (error) {
    console.error("[Permissions] failed to read studio owner", error);
    return false;
  }

  return String(data?.account_holder_user_id || "") === String(ctx.authUserId);
}

export async function canManageUsers(studioId) {
  const ctx = await resolveStudioAndUser(studioId);
  if (!ctx.authUserId || !ctx.studioId) return false;

  if (await isAccountHolder(ctx.studioId)) return true;

  const { data: member, error: memberError } = await supabase
    .from("studio_members")
    .select("roles")
    .eq("user_id", ctx.authUserId)
    .eq("studio_id", ctx.studioId)
    .maybeSingle();

  if (memberError) {
    console.error("[Permissions] failed to read studio member roles", memberError);
    return false;
  }

  const roles = normalizeRoles(member?.roles);
  if (!roles.includes("admin")) return false;

  const { data: perms, error: permsError } = await supabase
    .from("studio_permissions")
    .select("admins_can_manage_users")
    .eq("studio_id", ctx.studioId)
    .single();

  if (permsError) {
    console.error("[Permissions] failed to read studio permissions", permsError);
    return false;
  }

  return Boolean(perms?.admins_can_manage_users);
}

export async function hasFamilyAccess(studioId) {
  const ctx = await resolveStudioAndUser(studioId);
  if (!ctx.authUserId) return false;

  try {
    let linkQuery = supabase
      .from("parent_student_links")
      .select("student_id", { count: "exact", head: true })
      .eq("parent_id", ctx.authUserId);
    if (ctx.studioId) linkQuery = linkQuery.eq("studio_id", ctx.studioId);
    const { count: linkCount, error: linkError } = await linkQuery;
    if (!linkError && Number(linkCount || 0) > 0) return true;
    if (linkError) console.warn("[Permissions] parent_student_links lookup failed", linkError);
  } catch (err) {
    console.warn("[Permissions] parent_student_links lookup failed", err);
  }

  try {
    let childQuery = supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("parent_uuid", ctx.authUserId);
    if (ctx.studioId) childQuery = childQuery.eq("studio_id", ctx.studioId);
    const { count: childCount, error: childError } = await childQuery;
    if (childError) {
      console.warn("[Permissions] family child lookup failed", childError);
      return false;
    }
    return Number(childCount || 0) > 0;
  } catch (err) {
    console.warn("[Permissions] family child lookup failed", err);
    return false;
  }
}
