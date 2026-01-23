import { supabase } from "./supabaseClient.js";
import { getAuthUserId, getViewerContext } from "./utils.js";
import { setActiveProfileId } from "./active-profile.js";
import { showToast } from "./settings-shared.js";

function getHighestRole(roles) {
  const priority = { admin: 3, teacher: 2, student: 1, parent: 0 };
  if (!Array.isArray(roles)) return "student";
  return roles.slice().sort((a, b) => (priority[b?.toLowerCase()] ?? -1) - (priority[a?.toLowerCase()] ?? -1))[0];
}

function clearActiveStudentCacheIfStudent(roles) {
  if (!Array.isArray(roles)) return;
  const normalized = roles.map(r => String(r).toLowerCase());
  if (!normalized.includes("student")) return;
  const studioId = localStorage.getItem("activeStudioId");
  const authViewerId = localStorage.getItem("loggedInUser")
    ? JSON.parse(localStorage.getItem("loggedInUser")).id
    : null;
  if (studioId && authViewerId) {
    localStorage.removeItem(`aa.activeStudent.${studioId}.${authViewerId}`);
  }
  localStorage.removeItem("activeStudentId");
}

function promptRoleSwitch(roles) {
  const listContainer = document.getElementById("roleSwitchList");
  if (!listContainer) return;
  listContainer.innerHTML = "";
  roles.forEach(role => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "blue-button";
    btn.style = "margin: 5px 0; width: 100%;";
    btn.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    btn.onclick = () => {
      localStorage.setItem("activeRole", role);
      clearActiveStudentCacheIfStudent([role]);
      window.location.href = "home.html";
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });
  document.getElementById("roleSwitchModal").classList.add("is-open");
}

function promptUserSwitch() {
  const current = JSON.parse(localStorage.getItem("loggedInUser") || "{}");
  const allUsers = JSON.parse(localStorage.getItem("allUsers") || "[]");
  const others = allUsers.filter(u => String(u.id) !== String(current.id));

  if (others.length === 0) {
    showToast("No other profiles linked.");
    return;
  }

  const listContainer = document.getElementById("userSwitchList");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  if (current?.id) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "blue-button";
    btn.style = "margin: 5px 0; width: 100%;";
    btn.textContent = "Parent (Me)";
    btn.onclick = () => {
      setActiveProfileId(current.id);
      window.location.href = "home.html";
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  }

  others.forEach(u => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "blue-button";
    btn.style = "margin: 5px 0; width: 100%;";
    const rolesText = Array.isArray(u.roles) ? u.roles.join(", ") : (u.role || "");
    btn.textContent = `${u.firstName ?? ""} ${u.lastName ?? ""} (${rolesText})`.trim();
    btn.onclick = () => {
      localStorage.setItem("loggedInUser", JSON.stringify(u));
      setActiveProfileId(u.id);
      const highest = getHighestRole(Array.isArray(u.roles) ? u.roles : [u.role].filter(Boolean));
      localStorage.setItem("activeRole", highest);
      clearActiveStudentCacheIfStudent(Array.isArray(u.roles) ? u.roles : [u.role].filter(Boolean));
      window.location.href = "home.html";
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });

  document.getElementById("userSwitchModal").classList.add("is-open");
}

document.addEventListener("DOMContentLoaded", async () => {
  const authUserId = await getAuthUserId();
  if (!authUserId) {
    window.location.replace("./login.html");
    return;
  }

  const viewerContext = await getViewerContext();
  const roleList = viewerContext?.viewerRoles || [];

  const switchRoleBtn = document.getElementById("switchRoleBtn");
  if (switchRoleBtn) {
    switchRoleBtn.style.display = roleList.length > 1 ? "inline-flex" : "none";
    switchRoleBtn.addEventListener("click", () => promptRoleSwitch(roleList));
  }

  const switchUserBtn = document.getElementById("switchUserBtn");
  const allUsers = JSON.parse(localStorage.getItem("allUsers") || "[]");
  if (switchUserBtn) {
    switchUserBtn.style.display = allUsers.length > 1 ? "inline-flex" : "none";
    switchUserBtn.addEventListener("click", promptUserSwitch);
  }

  const studioSection = document.getElementById("studioSection");
  if (studioSection) {
    studioSection.style.display = viewerContext?.isAdmin ? "block" : "none";
  }

  const cancelUserSwitchBtn = document.getElementById("cancelUserSwitchBtn");
  if (cancelUserSwitchBtn) {
    cancelUserSwitchBtn.addEventListener("click", () => {
      document.getElementById("userSwitchModal").classList.remove("is-open");
    });
  }

  const cancelRoleSwitchBtn = document.getElementById("cancelRoleSwitchBtn");
  if (cancelRoleSwitchBtn) {
    cancelRoleSwitchBtn.addEventListener("click", () => {
      document.getElementById("roleSwitchModal").classList.remove("is-open");
    });
  }

  const roleModal = document.getElementById("roleSwitchModal");
  if (roleModal) {
    roleModal.addEventListener("click", (e) => {
      if (e.target === roleModal) roleModal.classList.remove("is-open");
    });
  }

  const userModal = document.getElementById("userSwitchModal");
  if (userModal) {
    userModal.addEventListener("click", (e) => {
      if (e.target === userModal) userModal.classList.remove("is-open");
    });
  }
});
