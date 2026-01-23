export const ACTIVE_PROFILE_KEY = "aa_active_profile_id";

export function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

export function setActiveProfileId(id) {
  if (!id) return;
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

export function clearActiveProfileId() {
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

const LAST_ACTIVE_STUDENT_PREFIX = "aa.lastActiveStudent";
const LAST_STUDENT_GLOBAL_KEY = "aa_last_student_id";

function buildLastActiveStudentKey(viewerId, studioId) {
  if (!viewerId) return null;
  const studioPart = studioId ? String(studioId) : "global";
  return `${LAST_ACTIVE_STUDENT_PREFIX}.${studioPart}.${viewerId}`;
}

export function persistLastActiveStudent(viewerId, studioId, studentId) {
  const key = buildLastActiveStudentKey(viewerId, studioId);
  if (!key || !studentId) return;
  localStorage.setItem(key, String(studentId));
  localStorage.setItem(LAST_STUDENT_GLOBAL_KEY, String(studentId));
}

export function getLastActiveStudent(viewerId, studioId) {
  const key = buildLastActiveStudentKey(viewerId, studioId);
  if (!key) return null;
  const perViewer = localStorage.getItem(key);
  if (perViewer) return perViewer;
  return localStorage.getItem(LAST_STUDENT_GLOBAL_KEY);
}

export function clearLastActiveStudent(viewerId, studioId) {
  const key = buildLastActiveStudentKey(viewerId, studioId);
  if (!key) return;
  localStorage.removeItem(key);
  localStorage.removeItem(LAST_STUDENT_GLOBAL_KEY);
}
