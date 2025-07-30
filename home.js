import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  console.log("DEBUG: home.js loaded");

  const storedUser = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");
  const isParent = JSON.parse(localStorage.getItem("isParent") || "false");
  console.log("DEBUG isParent flag:", isParent);

  if (!storedUser || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // ✅ Show modal if logged-in user is parent, teacher, or admin
  if (isParent || (storedUser.roles && (storedUser.roles.includes("teacher") || storedUser.roles.includes("admin") || storedUser.roles.includes("parent")))) {
    console.log("DEBUG: Parent detected, fetching children...");
    const { data: children, error } = await supabase
      .from('users')
      .select('id, firstName, lastName, email, roles, avatarUrl')
      .eq('parent_uuid', storedUser.id);

    console.log("DEBUG: Children fetched:", children, error);

    if (!error && children && children.length > 0) {
      children.forEach(c => {
        if (typeof c.roles === "string") {
          try { c.roles = JSON.parse(c.roles); }
          catch { c.roles = c.roles.split(",").map(r => r.trim()); }
        } else if (!Array.isArray(c.roles)) {
          c.roles = c.roles ? [c.roles] : [];
        }
      });

      showChildModal(children, storedUser);
      return; // stop UI load until selection
    }
  }

  loadHomeUI(storedUser, activeRole);
});

// ✅ Modal to select parent/child
function showChildModal(children, parent) {
  parent._children = children;
  const modal = document.getElementById("childSelectModal");
  const container = document.getElementById("childButtons");
  container.innerHTML = '';

  // ✅ Add parent option first
  const parentBtn = document.createElement("button");
  const rolesText = parent.roles?.length ? ` (${parent.roles.join(", ")})` : "";
  parentBtn.textContent = `${parent.firstName} ${parent.lastName}${rolesText}`;
  parentBtn.className = "blue-button modal-button";
  parentBtn.onclick = () => setActiveChild(parent, parent);
  container.appendChild(parentBtn);

  // ✅ Add children options
  children.forEach(child => {
    const btn = document.createElement("button");
    btn.textContent = `${child.firstName} ${child.lastName}`;
    btn.className = "blue-button modal-button";
    btn.onclick = () => setActiveChild(child, parent);
    container.appendChild(btn);
  });

  modal.style.display = "flex";
}

// ✅ Save child as logged-in user, keep parent context
function setActiveChild(child, parent) {
  console.log("DEBUG: Switching to child", child);
  if (!child.id) {
    console.error("ERROR: Child object missing ID");
    return;
  }

  localStorage.setItem("loggedInUser", JSON.stringify(child));
  localStorage.setItem("activeRole", Array.isArray(child.roles) ? child.roles[0] : "student");
  localStorage.setItem("loggedInParent", JSON.stringify(parent));
  localStorage.setItem("isParent", false);

  location.reload();
}

// ✅ Load home UI normally
async function loadHomeUI(userData, activeRole) {
  console.log("DEBUG: Loading home UI for", userData);

  // Load user info
  document.getElementById("welcomeTitle").textContent = `Welcome, ${userData.firstName}!`;
  document.getElementById("homeAvatar").src = userData.avatarUrl || "images/logos/default.png";

  // Load level badge
  document.getElementById("homeBadge").src = (activeRole === "student")
    ? `images/levelBadges/level${userData.level || 1}.png`
    : `images/levelBadges/${activeRole}.png`;

  // Level progress
  const progressBar = document.getElementById("homeProgressBar");
  const progressLabel = document.getElementById("homeProgressLabel");
  if (progressBar && progressLabel) {
    progressBar.style.width = `${userData.progress || 0}%`;
    progressLabel.textContent = `${Math.round(userData.progress || 0)}% to next level`;
  }

  // Role-specific buttons
  const myPointsBtn = document.getElementById("myPointsBtn");
  const reviewLogsBtn = document.getElementById("reviewLogsBtn");
  const manageUsersBtn = document.getElementById("manageUsersBtn");

  myPointsBtn.style.display = (activeRole === "student") ? "flex" : "none";
  reviewLogsBtn.style.display = (activeRole === "admin" || activeRole === "teacher") ? "flex" : "none";
  manageUsersBtn.style.display = (activeRole === "admin") ? "inline-block" : "none";
}
