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

  // ✅ Only show modal if this user is a parent
  if (isParent || (storedUser.roles && storedUser.roles.includes("parent"))) {
    console.log("DEBUG: Parent account detected, fetching children...");
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

      showChildModal(children);
      return; // stop UI until child is selected
    }
  }

  // ✅ Load normal UI for teacher/admin/student
  loadHomeUI(storedUser, activeRole);
});

// ✅ Modal only lists children
function showChildModal(children) {
  const modal = document.getElementById("childSelectModal");
  const container = document.getElementById("childButtons");
  container.innerHTML = '';

  children.forEach(child => {
    const btn = document.createElement("button");
    btn.textContent = `${child.firstName} ${child.lastName}`;
    btn.className = "blue-button modal-button";
    btn.onclick = () => setActiveChild(child);
    container.appendChild(btn);
  });

  modal.style.display = "flex";
}

// ✅ When a child is selected
function setActiveChild(child) {
  console.log("DEBUG: Switching to child", child);
  if (!child.id) return console.error("ERROR: Child missing ID");

  localStorage.setItem("loggedInUser", JSON.stringify(child));
  localStorage.setItem("activeRole", Array.isArray(child.roles) ? child.roles[0] : "student");
  localStorage.removeItem("loggedInParent"); // no parent context
  localStorage.setItem("isParent", false);

  location.reload();
}

async function loadHomeUI(userData, activeRole) {
  console.log("DEBUG: Loading home UI for", userData);

  const welcomeTitle = document.getElementById("welcomeTitle");
  if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${userData.firstName || "User"}!`;

  const avatarImg = document.getElementById("homeAvatar");
  if (avatarImg) avatarImg.src = userData.avatarUrl || "images/logos/default.png";

  const badgeImg = document.getElementById("homeBadge");
  if (badgeImg) {
    badgeImg.src = (activeRole === "student")
      ? `images/levelBadges/level${userData.level || 1}.png`
      : `images/levelBadges/${activeRole}.png`;
  }

  const progressBar = document.getElementById("homeProgressBar");
  const progressLabel = document.getElementById("homeProgressLabel");
  if (progressBar && progressLabel) {
    const progress = userData.progress || 0;
    progressBar.style.width = `${progress}%`;
    progressLabel.textContent = `${Math.round(progress)}% to next level`;
  }

  const myPointsBtn = document.getElementById("myPointsBtn");
  const reviewLogsBtn = document.getElementById("reviewLogsBtn");
  const manageUsersBtn = document.getElementById("manageUsersBtn");

  if (myPointsBtn) myPointsBtn.style.display = (activeRole === "student") ? "flex" : "none";
  if (reviewLogsBtn) reviewLogsBtn.style.display = (activeRole === "admin" || activeRole === "teacher") ? "flex" : "none";
  if (manageUsersBtn) manageUsersBtn.style.display = (activeRole === "admin") ? "inline-block" : "none";
}
