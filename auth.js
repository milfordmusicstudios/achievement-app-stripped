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
const VALID_VIEWS = ["teacher", "student"];

function getStoredRoles() {
  const raw = localStorage.getItem("activeStudioRoles");
  if (!raw) return [];
  const parsed = parseRoles(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function hasTeacherRole(roles) {
  return roles.includes("teacher") || roles.includes("admin");
}

function hasStudentRole(roles) {
  return roles.includes("student");
}

function getDefaultView({ hasTeacher, hasStudent }) {
  if (hasTeacher && !hasStudent) return "teacher";
  if (!hasTeacher && hasStudent) return "student";
  if (hasTeacher && hasStudent) return "teacher";
  return "student";
}

window.AA_getActiveView = function () {
  const stored = String(localStorage.getItem(VIEW_MODE_KEY) || "").toLowerCase();
  if (VALID_VIEWS.includes(stored)) {
    return stored;
  }
  const roles = getStoredRoles();
  const view = getDefaultView({
    hasTeacher: hasTeacherRole(roles),
    hasStudent: hasStudentRole(roles)
  });
  localStorage.setItem(VIEW_MODE_KEY, view);
  return view;
};

window.AA_applyViewMode = function () {
  const roles = getStoredRoles();
  const body = document.body;
  if (!body) {
    return { view: "teacher", allowToggle: false };
  }
  const hasTeacher = hasTeacherRole(roles);
  const hasStudent = hasStudentRole(roles);
  let view = window.AA_getActiveView();
  if (view === "teacher" && !hasTeacher) {
    view = hasStudent ? "student" : "teacher";
  }
  if (view === "student" && !hasStudent) {
    view = hasTeacher ? "teacher" : "student";
  }
  const allowToggle = hasTeacher && hasStudent;
  localStorage.setItem(VIEW_MODE_KEY, view);

  body.classList.toggle("has-teacher", hasTeacher);
  body.classList.toggle("has-student", hasStudent);
  body.classList.toggle("has-admin", roles.includes("admin"));
  body.classList.remove("view-teacher", "view-student");
  body.classList.add(view === "teacher" ? "view-teacher" : "view-student");

  return { view, allowToggle };
};

window.AA_setActiveView = function (mode) {
  const normalized = String(mode || "").toLowerCase();
  if (!VALID_VIEWS.includes(normalized)) {
    return window.AA_applyViewMode();
  }
  const roles = getStoredRoles();
  if (normalized === "teacher" && !hasTeacherRole(roles)) {
    return window.AA_applyViewMode();
  }
  if (normalized === "student" && !hasStudentRole(roles)) {
    return window.AA_applyViewMode();
  }
  localStorage.setItem(VIEW_MODE_KEY, normalized);
  return window.AA_applyViewMode();
};
