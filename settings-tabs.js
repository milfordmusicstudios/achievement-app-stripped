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
    show: () => true
  },
  {
    id: "studio",
    label: "Studio",
    href: "studio-settings-hub.html",
    show: roles => roles.includes("admin")
  }
];

function getPathName() {
  return window.location.pathname.split("/").pop() || "settings.html";
}

function markActive(tab, activePath) {
  const isActive =
    activePath === tab.href ||
    (activePath === "settings.html" && tab.href === "settings-security.html");
  return isActive ? 'class="settings-tab is-active" aria-current="page"' : 'class="settings-tab"';
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

function renderTabs(tabs) {
  const inner = document.createElement("div");
  inner.className = "settings-tabs-inner";
  inner.innerHTML = tabs.join("");
  return inner;
}

async function renderSettingsTabs() {
  const container = document.getElementById("settings-tabs");
  if (!container) return;
  const roles = await resolveRoles();
  const activePath = getPathName();
  const tabs = TAB_CONFIG.filter(tab => tab.show(roles)).map(tab => `<a ${markActive(tab, activePath)} href="${tab.href}">${tab.label}</a>`);
  if (!tabs.length) {
    container.style.display = "none";
    return;
  }
  container.innerHTML = "";
  container.appendChild(renderTabs(tabs));
}

document.addEventListener("DOMContentLoaded", renderSettingsTabs);
