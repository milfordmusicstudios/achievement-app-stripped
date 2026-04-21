import { supabase } from './supabaseClient.js';
import { parseRoles } from './utils.js';

/**
 * Require a logged-in user.
 * If not authenticated, redirect to login.
 */
export async function requireAuth() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session) {
    window.location.href = 'login.html';
    return null;
  }

  return session.user;
}

/**
 * Get the current authenticated user (no redirect).
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) return null;
  return user;
}

/**
 * Sign out and redirect to login.
 */
export async function signOut() {
  await window.getSupabaseClient()?.auth.signOut();
  window.location.href = 'login.html';
}

const VIEW_MODE_KEY = "aa_active_view";

function safeParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getStoredRoles() {
  const studioRolesRaw = localStorage.getItem("activeStudioRoles");
  const profileRaw = localStorage.getItem("loggedInUser");
  const profile = safeParseJson(profileRaw);

  const studioRoles = parseRoles(studioRolesRaw);
  const profileRoles = parseRoles(profile?.roles || profile?.role);

  return Array.from(new Set([
    ...(Array.isArray(studioRoles) ? studioRoles : []),
    ...(Array.isArray(profileRoles) ? profileRoles : [])
  ]));
}

function getHighestRole(roles) {
  const list = Array.isArray(roles) ? roles : [];
  if (list.includes("owner")) return "owner";
  if (list.includes("admin")) return "admin";
  if (list.includes("teacher")) return "teacher";
  if (list.includes("student")) return "student";
  if (list.includes("parent")) return "parent";
  return "student";
}

function getViewForRole(role) {
  if (role === "owner" || role === "admin" || role === "teacher") return "teacher";
  return "student";
}

window.AA_getActiveView = function () {
  const roles = getStoredRoles();
  const highestRole = getHighestRole(roles);
  return getViewForRole(highestRole);
};

window.AA_applyViewMode = function () {
  const roles = getStoredRoles();
  const body = document.body;
  if (!body) {
    return { view: "teacher", allowToggle: false };
  }
  const highestRole = getHighestRole(roles);
  const view = getViewForRole(highestRole);
  const hasTeacher = view === "teacher";
  const hasStudent = view === "student";
  const allowToggle = false;
  localStorage.setItem(VIEW_MODE_KEY, view);

  body.classList.toggle("has-teacher", hasTeacher);
  body.classList.toggle("has-student", hasStudent);
  body.classList.toggle("has-admin", roles.includes("admin"));
  body.classList.toggle("has-owner", roles.includes("owner"));
  body.classList.remove("view-teacher", "view-student");
  body.classList.add(view === "teacher" ? "view-teacher" : "view-student");

  return { view, allowToggle, role: highestRole };
};

window.AA_setActiveView = function () {
  return window.AA_applyViewMode();
};
