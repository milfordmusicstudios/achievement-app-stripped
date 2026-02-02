import { supabase } from "./supabaseClient.js";

export function parseRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.map(r => String(r).toLowerCase());
  if (typeof roles === "string") {
    try {
      const parsed = JSON.parse(roles);
      return Array.isArray(parsed) ? parsed.map(r => String(r).toLowerCase()) : [String(parsed).toLowerCase()];
    } catch {
      return roles.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [String(roles).toLowerCase()];
}

export function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

export function normalizeTextArray(valueOrArray) {
  if (!valueOrArray) return [];
  if (Array.isArray(valueOrArray)) {
    return valueOrArray.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof valueOrArray === "string") {
    const trimmed = valueOrArray.trim();
    return trimmed ? [trimmed] : [];
  }
  return [String(valueOrArray).trim()].filter(Boolean);
}

export async function loadTeachersForStudio(studioId) {
  if (!studioId) return [];
  const { data: users, error } = await supabase
    .from("users")
    .select("id, firstName, lastName, roles")
    .eq("studio_id", studioId);

  if (error) {
    console.error("[Settings] teacher load failed", error);
    return [];
  }

  return (users || [])
    .filter(u => {
      const roles = parseRoles(u.roles);
      return roles.includes("teacher") || roles.includes("admin");
    })
    .sort(
      (a, b) =>
        (a.lastName || "").localeCompare(b.lastName || "") ||
        (a.firstName || "").localeCompare(b.firstName || "")
    )
    .map(t => ({
      id: t.id,
      label: (`${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() || "Unnamed Teacher")
    }));
}

export function applyTeacherOptionsToSelect(selectEl, teacherOptions) {
  if (!selectEl) return;
  if (!teacherOptions || teacherOptions.length === 0) {
    selectEl.innerHTML = "";
    selectEl.disabled = true;
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No teachers available";
    selectEl.appendChild(opt);
    return;
  }
  const selected = new Set(Array.from(selectEl.selectedOptions || []).map(o => o.value));
  selectEl.innerHTML = "";
  teacherOptions.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    if (selected.has(t.id)) opt.selected = true;
    selectEl.appendChild(opt);
  });
  selectEl.disabled = false;
}

export { loadLinkedStudentsForParent as loadLinkedStudents } from "./account-profiles.js";
