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

function buildLastActiveStudentKey(viewerId, studioId) {
  if (!viewerId) return null;
  const studioPart = studioId ? String(studioId) : "global";
  return `${LAST_ACTIVE_STUDENT_PREFIX}.${studioPart}.${viewerId}`;
}

export function persistLastActiveStudent(viewerId, studioId, studentId) {
  const key = buildLastActiveStudentKey(viewerId, studioId);
  if (!key || !studentId) return;
  localStorage.setItem(key, String(studentId));
}

export function getLastActiveStudent(viewerId, studioId) {
  const key = buildLastActiveStudentKey(viewerId, studioId);
  if (!key) return null;
  return localStorage.getItem(key);
}

export function clearLastActiveStudent(viewerId, studioId) {
  const key = buildLastActiveStudentKey(viewerId, studioId);
  if (!key) return;
  localStorage.removeItem(key);
}
