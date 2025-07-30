import { supabase } from './supabase.js';

function normalizeUUID(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

async function fetchRelatedUsers(user) {
  const userIdStr = normalizeUUID(user.id);
  const parentIdStr = normalizeUUID(user.parent_uuid);
  let sameGroupUsers = [];

  const { data: children } = await supabase.from('users').select('*').eq('parent_uuid', userIdStr);
  if (children?.length) {
    sameGroupUsers = children;
  } else if (parentIdStr) {
    const { data: siblings } = await supabase.from('users').select('*').eq('parent_uuid', parentIdStr);
    if (siblings?.length) sameGroupUsers = siblings.filter(u => normalizeUUID(u.id) !== userIdStr);
  }
  return sameGroupUsers;
}

function promptUserSwitch() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const allUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
  const userIdStr = normalizeUUID(user.id);

  const listContainer = document.getElementById("userSwitchList");
  listContainer.innerHTML = "";
  allUsers.forEach(u => {
    if (normalizeUUID(u.id) === userIdStr) return;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "blue-button";
    btn.style = "margin: 5px 0; width: 100%;";
    let roleText = Array.isArray(u.roles) ? ` (${u.roles.join(", ")})` : "";
    btn.textContent = `${u.firstName} ${u.lastName}${roleText}`;
    btn.onclick = () => {
      localStorage.setItem("loggedInUser", JSON.stringify(u));
      const defaultRole = Array.isArray(u.roles) ? u.roles[0] : "student";
      localStorage.setItem("activeRole", defaultRole);
      window.location.href = "index.html";
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });
  document.getElementById("userSwitchModal").style.display = "flex";
}

function promptRoleSwitch() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const roles = Array.isArray(user.roles) ? user.roles : [user.role];
  const listContainer = document.getElementById("roleSwitchList");
  listContainer.innerHTML = "";
  roles.forEach(role => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "blue-button";
    btn.style = "margin: 5px 0; width: 100%;";
    btn.textContent = capitalize(role);
    btn.onclick = () => {
      localStorage.setItem("activeRole", role);
      window.location.href = "index.html";
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });
  document.getElementById("roleSwitchModal").style.display = "flex";
}

/** ✅ Save Settings - Updates Auth email/password AND users table */
async function saveSettings() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const newEmail = document.getElementById('newEmail').value.trim();
  const newPassword = document.getElementById('newPassword').value.trim();

  const updatedUser = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: newEmail || user.email
  };

  try {
    // ✅ 1. Update Supabase Auth credentials if changed
    if (newEmail || newPassword) {
      const { error: authError } = await supabase.auth.updateUser({
        email: newEmail || undefined,
        password: newPassword || undefined
      });
      if (authError) throw authError;
      console.log("[DEBUG] Auth email/password updated successfully");
    }

    // ✅ 2. Update metadata in users table
    const { error: dbError } = await supabase
      .from("users")
      .update(updatedUser)
      .eq("id", user.id);
    if (dbError) throw dbError;

    // ✅ 3. Save changes locally and confirm
    Object.assign(user, updatedUser);
    localStorage.setItem("loggedInUser", JSON.stringify(user));
    alert("Settings updated successfully!");
    window.location.href = "index.html";
  } catch (err) {
    console.error("[ERROR] Save settings failed:", err);
    alert("Failed to update settings: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");
  if (!user || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "index.html";
    return;
  }

  // ✅ Populate user fields
  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value = user.lastName || '';
  document.getElementById('newEmail').value = user.email || '';
  document.getElementById('avatarImage').src = user.avatarUrl || "images/logos/default.png";

  // ✅ Load related users
// ✅ Load related users
const relatedUsers = await fetchRelatedUsers(user);
let existingAllUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
const updatedAllUsers = [...existingAllUsers];

// ✅ Always include the current user
if (!updatedAllUsers.some(u => u.id === user.id)) {
  updatedAllUsers.push(user);
}

// ✅ Add children if any
relatedUsers.forEach(ru => {
  if (!updatedAllUsers.some(u => u.id === ru.id)) {
    updatedAllUsers.push(ru);
  }
});

// ✅ If the user is teacher/admin AND also has parent_uuid logic (children exist), 
// ensure a "parent self" entry is added
if ((user.roles || []).some(r => ["teacher", "admin"].includes(r.toLowerCase())) && relatedUsers.length > 0) {
  const parentCopy = { ...user, roles: [...new Set([...(user.roles || []), "parent"])] };
  if (!updatedAllUsers.some(u => u.id === parentCopy.id && u.roles.includes("parent"))) {
    updatedAllUsers.push(parentCopy);
  }
}

localStorage.setItem("allUsers", JSON.stringify(updatedAllUsers));

  // ✅ Show/hide buttons
  document.getElementById("switchUserBtn").style.display = (updatedAllUsers.length > 1) ? "inline-block" : "none";
  document.getElementById("switchRoleBtn").style.display = (user.roles?.length > 1) ? "inline-block" : "none";

  // ✅ Button bindings
  document.getElementById("logoutBtn").addEventListener("click", () => { localStorage.clear(); window.location.href = "login.html"; });
  document.getElementById("cancelBtn").addEventListener("click", () => window.location.href = "index.html");
  document.getElementById("switchRoleBtn").addEventListener("click", promptRoleSwitch);
  document.getElementById("switchUserBtn").addEventListener("click", promptUserSwitch);
  document.getElementById("saveBtn").addEventListener("click", (e) => { e.preventDefault(); saveSettings(); });

  // ✅ Auto-trigger modal if coming from parent redirect
  if (sessionStorage.getItem("forceUserSwitch") === "true") {
    console.log("[DEBUG] Forcing user switch modal...");
    sessionStorage.removeItem("forceUserSwitch");
    setTimeout(() => promptUserSwitch(), 400);
  }
});
