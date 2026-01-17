import { supabase } from './supabaseClient.js';
import { ensureStudioContextAndRoute } from './studio-routing.js';
import { ensureUserRow } from './utils.js';

const qs = id => document.getElementById(id);
const safeParse = value => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

let currentProfile = null;
let availableUsers = [];


async function loadLevel(levelId) {
  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("id", levelId)
    .single();

  if (error) {
    console.error("Failed to load level", error);
    return null;
  }
  return data;
}

function renderIdentity(profile, level) {
qs('welcomeText').textContent = `Welcome, ${profile.firstName || 'Student'}!`;
const avatarImg = document.getElementById("avatarImg");
const url = profile?.avatarUrl;

if (avatarImg) {
  avatarImg.src = (typeof url === "string" && url.trim())
    ? url
    : "images/icons/default.png";
}
qs('levelBadgeImg').src = level.badge;

  const pct = Math.min(
    100,
    Math.round(
((profile.points - level.minPoints) /
  (level.maxPoints - level.minPoints)) *
  100
    )
  );

  qs('progressFill').style.width = `${pct}%`;
  qs('progressText').textContent = `${profile.points} XP`;
  qs('progressPercent').textContent = `${pct}% complete`;
}

function getUserLabel(user) {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || "Student";
}

function uniqueUsers(users) {
  const map = new Map();
  users.forEach(u => {
    if (u && u.id && !map.has(u.id)) map.set(u.id, u);
  });
  return Array.from(map.values());
}

async function loadAvailableUsers(parentId, fallbackProfile) {
  let users = safeParse(localStorage.getItem("allUsers"));
  if (!Array.isArray(users)) users = [];

  if (!users.length && parentId) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("parent_uuid", parentId)
      .order("created_at", { ascending: true });

    if (!error && Array.isArray(data)) {
      users = data;
      localStorage.setItem("allUsers", JSON.stringify(users));
    }
  }

  if (fallbackProfile) users.push(fallbackProfile);
  return uniqueUsers(users);
}

function closeAvatarMenu() {
  const menu = qs("avatarMenu");
  const button = qs("avatarSwitcher");
  if (!menu || !button) return;
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
}

function renderAvatarMenu(users, activeId) {
  const menu = qs("avatarMenu");
  if (!menu) return;
  menu.innerHTML = "";

  users.forEach(user => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "avatar-menu-item";
    item.setAttribute("role", "menuitem");
    if (user.id === activeId) {
      item.classList.add("is-active");
      item.setAttribute("aria-current", "true");
    }

    const img = document.createElement("img");
    const imgUrl = (typeof user.avatarUrl === "string" && user.avatarUrl.trim())
      ? user.avatarUrl
      : "images/icons/default.png";
    img.src = imgUrl;
    img.alt = "";
    img.onerror = () => {
      img.onerror = null;
      img.src = "images/icons/default.png";
    };

    const label = document.createElement("span");
    label.textContent = getUserLabel(user);

    item.appendChild(img);
    item.appendChild(label);
    item.addEventListener("click", async () => {
      await switchUser(user);
    });
    menu.appendChild(item);
  });
}

async function refreshHomeForUser(profile) {
  const levelRow = await loadLevel(profile.level || 1);
  if (!levelRow) return;
  renderIdentity(profile, levelRow);
}

async function switchUser(user) {
  if (!user || !user.id) return;
  if (currentProfile?.id === user.id) {
    closeAvatarMenu();
    return;
  }

  localStorage.setItem("loggedInUser", JSON.stringify(user));
  localStorage.setItem("activeStudentId", user.id);
  currentProfile = user;

  await refreshHomeForUser(user);
  renderAvatarMenu(availableUsers, user.id);
  closeAvatarMenu();
}

function initAvatarSwitcher(users) {
  const button = qs("avatarSwitcher");
  const menu = qs("avatarMenu");
  if (!button || !menu) return;

  if (!users || users.length <= 1) {
    button.classList.add("no-switch");
    menu.hidden = true;
    return;
  }

  renderAvatarMenu(users, currentProfile?.id);
  menu.hidden = true;

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = !menu.hidden;
    if (isOpen) {
      closeAvatarMenu();
      return;
    }
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) {
      closeAvatarMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAvatarMenu();
  });
}

async function init() {
  // 🔒 Hard auth gate
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    window.location.href = "login.html";
    return;
  }

  await ensureUserRow();

  const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
  if (routeResult?.redirected) return;


  // 🔁 Active student must already be selected
  const raw = localStorage.getItem("loggedInUser");
  if (!raw) {
    // Logged in parent, but no student selected yet
    window.location.href = "settings.html";
    return;
  }

const profile = JSON.parse(raw);
currentProfile = profile;

const levelRow = await loadLevel(profile.level || 1);
renderIdentity(profile, levelRow);

const parentId = sessionData?.session?.user?.id;
availableUsers = await loadAvailableUsers(parentId, profile);
initAvatarSwitcher(availableUsers);
}

document.addEventListener('DOMContentLoaded', init);
