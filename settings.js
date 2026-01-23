import { getAuthUserId, getViewerContext } from "./utils.js";
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


  const studioSection = document.getElementById("studioSection");
  if (studioSection) {
    studioSection.style.display = viewerContext?.isAdmin ? "block" : "none";
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

  // Switch User removed; no-op
});
