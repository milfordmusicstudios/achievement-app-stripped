import { supabase } from './supabase.js';

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function promptUserSwitch() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const allUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
  const userIdStr = String(user.id);
  const parentIdStr = user.parent_uuid ? String(user.parent_uuid) : null;

  const userList = allUsers.filter(u => {
    const uIdStr = String(u.id);
    const uParentStr = u.parent_uuid ? String(u.parent_uuid) : null;
    return uIdStr !== userIdStr && (
      (uParentStr === userIdStr) ||
      (parentIdStr && uParentStr === parentIdStr) ||
      (u.email && u.email.toLowerCase() === user.email.toLowerCase())
    );
  });

  console.log("[DEBUG] Users available for switch:", userList);

  const listContainer = document.getElementById("userSwitchList");
  listContainer.innerHTML = "";
  userList.forEach(u => {
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

  try {
    const { data: allUsers, error } = await supabase.from("users").select("*");
    if (!error && Array.isArray(allUsers)) {
      localStorage.setItem("allUsers", JSON.stringify(allUsers));
      const userIdStr = String(user.id);
      const parentIdStr = user.parent_uuid ? String(user.parent_uuid) : null;

      const sameGroupUsers = allUsers.filter(u => {
        const uIdStr = String(u.id);
        const uParentStr = u.parent_uuid ? String(u.parent_uuid) : null;
        return uIdStr !== userIdStr && (
          (uParentStr === userIdStr) ||
          (parentIdStr && uParentStr === parentIdStr) ||
          (u.email && u.email.toLowerCase() === user.email.toLowerCase())
        );
      });

      console.log("[DEBUG] sameGroupUsers detected:", sameGroupUsers);
      document.getElementById("switchUserBtn").style.display = sameGroupUsers.length > 0 ? "inline-block" : "none";
    }
  } catch (err) {
    console.error("[DEBUG] Failed to load users:", err);
    document.getElementById("switchUserBtn").style.display = "none";
  }

  const switchRoleBtn = document.getElementById("switchRoleBtn");
  if (Array.isArray(user.roles) && user.roles.length > 1) {
    switchRoleBtn.style.display = "inline-block";
    switchRoleBtn.textContent = `Switch Role (Currently: ${capitalize(activeRole)})`;
  } else {
    switchRoleBtn.style.display = "none";
  }

  document.getElementById("avatarInput").addEventListener("change", async () => {
    const file = document.getElementById("avatarInput").files[0];
    if (!file) return;
    const userId = user.id;
    const fileExt = file.name.split('.').pop();
    const filePath = `public/${userId}.${fileExt}`;
    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData, error: urlError } = supabase.storage.from("avatars").getPublicUrl(filePath);
      if (urlError) throw urlError;
      const avatarUrl = urlData.publicUrl;
      const { error: updateError } = await supabase.from("users").update({ avatarUrl }).eq("id", userId);
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
