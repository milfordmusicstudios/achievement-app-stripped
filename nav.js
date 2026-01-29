import { NAV_CONFIG } from "./nav-config.js";
import { getViewerContext } from "./utils.js";

function getPathName() {
  const raw = window.location.pathname || "";
  const file = raw.split("/").pop();
  return file || "index.html";
}

function resolveRoleFromStorage() {
  const stored = localStorage.getItem("activeRole");
  return stored ? String(stored).toLowerCase() : "student";
}

async function resolveRole() {
  try {
    const ctx = await getViewerContext();
    if (ctx?.isAdmin) return "admin";
    if (ctx?.isTeacher) return "teacher";
    if (ctx?.isStudent) return "student";
    if (ctx?.isParent) return "parent";
  } catch (err) {
    console.warn("[Nav] viewer context failed", err);
  }
  return resolveRoleFromStorage();
}

function renderNav(role) {
  const mount = document.getElementById("app-bottom-nav");
  if (!mount) return;

  const items = NAV_CONFIG[role] || NAV_CONFIG.student;
  const current = getPathName();

  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", "Primary");

  items.forEach(item => {
    const link = document.createElement("a");
    link.href = item.href;
    link.className = "bottom-nav-link";
    link.textContent = item.label;
    if (item.matchPaths.includes(current)) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
    nav.appendChild(link);
  });

  mount.innerHTML = "";
  mount.appendChild(nav);
}

const AUTH_PAGES = new Set(["login.html", "signup.html", "forgot-password.html"]);

document.addEventListener("DOMContentLoaded", async () => {
  const current = getPathName();
  if (AUTH_PAGES.has(current)) {
    renderNav(resolveRoleFromStorage());
    return;
  }

  const role = await resolveRole();
  renderNav(role);
});
