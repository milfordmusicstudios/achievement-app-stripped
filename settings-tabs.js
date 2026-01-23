import { getViewerContext, parseRoles } from "./utils.js";

const TAB_CONFIG = [
  {
    id: "login",
    label: "Login & Security",
    href: "settings-security.html",
    show: () => true
  },
  {
    id: "family",
    label: "Family",
    href: "settings-family.html",
    show: roles => roles.includes("student") || roles.includes("parent")
  },
  {
    id: "studio",
    label: "Studio",
    href: "studio-settings.html",
    show: roles => roles.includes("admin")
  }
];

function getPathName() {
  return window.location.pathname.split("/").pop() || "settings.html";
}

async function resolveRoles() {
  const stored = localStorage.getItem("activeStudioRoles");
  if (stored) {
    const parsed = parseRoles(stored);
    if (parsed.length) return parsed.map(r => String(r).toLowerCase());
  }

  const ctx = await getViewerContext();
  const ctxRoles = ctx?.viewerRoles || [];
  if (ctxRoles.length) {
    localStorage.setItem("activeStudioRoles", JSON.stringify(ctxRoles));
  }
  return ctxRoles.map(r => String(r).toLowerCase());
}

function buildTabs(roleList, activePath) {
  return TAB_CONFIG.filter(tab => tab.show(roleList)).map(tab => {
    const isActive =
      activePath === tab.href ||
      (activePath === "settings.html" && tab.href === "settings-security.html");
    const attrs = isActive
      ? 'class="settings-tab is-active" aria-current="page"'
      : 'class="settings-tab"';
    return `<a ${attrs} href="${tab.href}">${tab.label}</a>`;
  });
}

async function renderSettingsTabs() {
  const container = document.getElementById("settings-tabs");
  if (!container) return;
  const roles = await resolveRoles();
  const tabs = buildTabs(roles, getPathName());
  if (!tabs.length) {
    container.style.display = "none";
    return;
  }
  container.innerHTML = `<div class="settings-tabs-inner">${tabs.join("")}</div>`;
}

document.addEventListener("DOMContentLoaded", renderSettingsTabs);
