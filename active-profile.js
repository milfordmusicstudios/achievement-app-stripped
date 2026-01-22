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
