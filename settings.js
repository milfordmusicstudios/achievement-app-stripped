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

  const { data: children, error: childErr } = await supabase
    .from('users')
    .select('*')
    .eq('parent_uuid', userIdStr);
  if (!childErr && children.length > 0) {
    sameGroupUsers = children;
  } else if (parentIdStr) {
    const { data: siblings, error: sibErr } = await supabase
      .from('users')
      .select('*')
      .eq('parent_uuid', parentIdStr);
    if (!sibErr && siblings.length > 0) {
      sameGroupUsers = siblings.filter(u => normalizeUUID(u.id) !== userIdStr);
    }
  }

  console.log("[DEBUG] Related users fetched:", sameGroupUsers);
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

async function saveSettings() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const updatedUser = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: document.getElementById('newEmail').value.trim()
  };
  try {
    const { error } = await supabase.from("users").update(updatedUser).eq("id", user.id);
    if (error) throw error;
    Object.assign(user, updatedUser);
    localStorage.setItem("loggedInUser", JSON.stringify(user));
    alert("Settings saved!");
    window.location.href = "index.html";
  } catch (err) {
    console.error("Save error:", err);
    alert("Could not save settings: " + err.message);
  }
}

function handleLogout() {
  localStorage.clear();
  window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");
  if (!user || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "index.html";
    return;
  }

  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value = user.lastName || '';
  document.getElementById('newEmail').value = user.email || '';
  document.getElementById('avatarImage').src = user.avatarUrl || "images/logos/default.png";

  // ✅ Ensure roles is always an array and parse JSON if needed
  if (!user.roles && user.role) {
    user.roles = [user.role];
  } else if (typeof user.roles === "string") {
    try {
      user.roles = JSON.parse(user.roles);
    } catch {
      user.roles = user.roles.split(",").map(r => r.trim());
    }
  } else if (!Array.isArray(user.roles)) {
    user.roles = user.roles ? [user.roles] : [];
  }
  console.log("DEBUG (fixed) user.roles:", user.roles);

  // Fetch related users
  const relatedUsers = await fetchRelatedUsers(user);

  // ✅ Combine current user with related users
  const allUsers = [user, ...relatedUsers];
  localStorage.setItem("allUsers", JSON.stringify(allUsers));
  console.log("DEBUG allUsers:", allUsers);

  // ✅ Show Switch User Button if there are related users or more than one user
  const switchUserBtn = document.getElementById("switchUserBtn");
// ✅ More reliable logic
const existingAllUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
const sameEmailUsers = existingAllUsers.filter(u => u.email?.toLowerCase() === user.email?.toLowerCase());

// ✅ Show button if: related users exist, or allUsers has multiple entries, or same email users exist
if (relatedUsers.length > 0 || existingAllUsers.length > 1 || sameEmailUsers.length > 1) {
  switchUserBtn.style.display = "inline-block";
} else {
  switchUserBtn.style.display = "none";
}

  // ✅ Show Switch Role Button if user has multiple roles
  const switchRoleBtn = document.getElementById("switchRoleBtn");
  if (user.roles.length > 1) {
    switchRoleBtn.style.display = "inline-block";
    switchRoleBtn.textContent = `Switch Role (Currently: ${capitalize(activeRole)})`;
  } else {
    switchRoleBtn.style.display = "none";
  }

  document.getElementById("avatarInput").addEventListener("change", async () => {
    const file = document.getElementById("avatarInput").files[0];
    if (!file) return;
    const fileExt = file.name.split('.').pop();
    const filePath = `public/${user.id}.${fileExt}`;
    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData, error: urlError } = supabase.storage.from("avatars").getPublicUrl(filePath);
      if (urlError) throw urlError;
      const avatarUrl = urlData.publicUrl;
      const { error: updateError } = await supabase.from("users").update({ avatarUrl }).eq("id", user.id);
      if (updateError) throw updateError;
      user.avatarUrl = avatarUrl;
      localStorage.setItem("loggedInUser", JSON.stringify(user));
      document.getElementById("avatarImage").src = avatarUrl;
      alert("Avatar updated successfully!");
    } catch (err) {
      console.error("Avatar upload error:", err);
      alert("Failed to upload avatar: " + err.message);
    }
  });

  document.getElementById("avatarImage").addEventListener("click", () => document.getElementById("avatarInput").click());
  document.getElementById("saveBtn").addEventListener("click", e => { e.preventDefault(); saveSettings(); });
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("cancelBtn").addEventListener("click", () => window.location.href = "index.html");
  document.getElementById("switchRoleBtn").addEventListener("click", promptRoleSwitch);
  document.getElementById("switchUserBtn").addEventListener("click", promptUserSwitch);
});
