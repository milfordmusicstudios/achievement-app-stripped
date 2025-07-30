import { supabase } from './supabase.js';

function normalizeUUID(uuid) {
  return uuid ? String(uuid).trim().toLowerCase() : null;
}

document.addEventListener("DOMContentLoaded", async () => {
  const storedUser = JSON.parse(localStorage.getItem("loggedInUser"));
  const switchUserBtn = document.getElementById("switchUserBtn");
  const roleSwitchBtn = document.getElementById("switchRoleBtn");

  if (!storedUser) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // ✅ Fetch siblings of the user
  async function fetchRelatedUsers(user) {
    const parentId = normalizeUUID(user.parent_uuid);
    let siblings = [];

    if (parentId) {
      const { data, error } = await supabase
        .from('users')
        .select('id, firstName, lastName, email, roles')
        .eq('parent_uuid', parentId);
      if (!error && data) siblings = data;
    }

    console.log("[DEBUG] Related users fetched:", siblings);
    return siblings;
  }

  // ✅ Build full user list
  const siblings = await fetchRelatedUsers(storedUser);
  let updatedAllUsers = [storedUser, ...siblings];

  // ✅ Include loggedInParent and its children
  const loggedInParent = JSON.parse(localStorage.getItem("loggedInParent"));
  if (loggedInParent && !updatedAllUsers.some(u => u.id === loggedInParent.id)) {
    updatedAllUsers.push(loggedInParent);

    const { data: parentChildren } = await supabase
      .from('users')
      .select('id, firstName, lastName, email, roles')
      .eq('parent_uuid', loggedInParent.id);

    if (parentChildren) {
      parentChildren.forEach(c => {
        if (!updatedAllUsers.some(u => u.id === c.id)) {
          updatedAllUsers.push(c);
        }
      });
    }
  }

  // ✅ Normalize roles for every user
  updatedAllUsers.forEach(u => {
    if (typeof u.roles === "string") {
      try { u.roles = JSON.parse(u.roles); }
      catch { u.roles = u.roles.split(",").map(r => r.trim()); }
    } else if (!Array.isArray(u.roles)) {
      u.roles = u.roles ? [u.roles] : [];
    }
  });

  console.log("[DEBUG] allUsers:", updatedAllUsers);

  // ✅ Show Switch User button if more than one profile
  switchUserBtn.style.display = updatedAllUsers.length > 1 ? "inline-block" : "none";

  // ✅ Show Switch Role button if multiple roles exist
  const hasMultipleRoles = storedUser.roles && storedUser.roles.length > 1;
  roleSwitchBtn.style.display = hasMultipleRoles ? "inline-block" : "none";

  // ✅ Switch User Modal
  switchUserBtn.addEventListener("click", () => {
    const modal = document.getElementById("userSwitchModal");
    const container = document.getElementById("userSwitchList");
    container.innerHTML = "";

    updatedAllUsers.forEach(u => {
      const btn = document.createElement("button");
      btn.textContent = `${u.firstName} ${u.lastName}`;
      btn.className = "blue-button";
      btn.onclick = () => {
        localStorage.setItem("loggedInUser", JSON.stringify(u));
        const defaultRole = Array.isArray(u.roles) ? u.roles[0] : "student";
        localStorage.setItem("activeRole", defaultRole);
        modal.style.display = "none";
        location.reload();
      };
      container.appendChild(btn);
    });

    modal.style.display = "flex";
  });

  // ✅ Switch Role Modal
  roleSwitchBtn.addEventListener("click", () => {
    const modal = document.getElementById("roleSwitchModal");
    const container = document.getElementById("roleSwitchList");
    container.innerHTML = "";

    storedUser.roles.forEach(role => {
      const btn = document.createElement("button");
      btn.textContent = role;
      btn.className = "blue-button";
      btn.onclick = () => {
        localStorage.setItem("activeRole", role);
        modal.style.display = "none";
        location.reload();
      };
      container.appendChild(btn);
    });

    modal.style.display = "flex";
  });
});
