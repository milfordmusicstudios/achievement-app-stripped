import { getActiveStudioIdForUser, getAuthUserId, getViewerContext } from "./utils.js";
import { canManageUsers, isAccountHolder } from "./permissions.js";

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
    show: permissions => permissions.isAccountHolder || permissions.isStudent
  },
  {
    id: "studio",
    label: "Studio",
    href: "studio-settings-hub.html",
    show: permissions => (permissions.isAdmin || permissions.isOwner) && !permissions.isStudent
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

async function resolvePermissions() {
  const authUserId = await getAuthUserId();
  const studioId = await getActiveStudioIdForUser(authUserId);
  const viewerContext = await getViewerContext();
  if (!authUserId || !studioId) {
    return {
      isAccountHolder: false,
      canManageUsers: false,
      isAdmin: false,
      isOwner: false,
      isStudent: false
    };
  }

  const [holder, canManage] = await Promise.all([
    isAccountHolder(studioId),
    canManageUsers(studioId)
  ]);
  return {
    isAccountHolder: holder,
    canManageUsers: canManage,
    isAdmin: Boolean(viewerContext?.isAdmin),
    isOwner: Boolean(viewerContext?.isOwner),
    isStudent: Boolean(viewerContext?.isStudent),
    accountIsAdmin: Boolean(viewerContext?.accountIsAdmin),
    accountIsOwner: Boolean(viewerContext?.accountIsOwner)
  };
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
  container.style.visibility = "hidden";
  const permissions = await resolvePermissions();
  const activePath = getPathName();
  const tabs = TAB_CONFIG
    .filter(tab => tab.show(permissions))
    .map(tab => `<a ${markActive(tab, activePath)} href="${tab.href}">${tab.label}</a>`);
  if (!tabs.length) {
    container.style.display = "none";
    return;
  }
  container.innerHTML = "";
  container.appendChild(renderTabs(tabs));
  container.style.visibility = "";
}

document.addEventListener("DOMContentLoaded", renderSettingsTabs);
