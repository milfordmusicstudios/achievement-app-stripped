import { supabase } from './supabase.js';

function normalizeUUID(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

// ✅ Add Child Logic
async function createChildUser() {
  const currentUser = JSON.parse(localStorage.getItem("loggedInUser"));

  const child = {
    firstName: document.getElementById("childFirstName").value.trim(),
    lastName: document.getElementById("childLastName").value.trim(),
    email: document.getElementById("childEmail").value.trim(),
    instrument: [document.getElementById("childInstrument").value.trim()],
    roles: ["student"],
    teacherIds: [],
    parent_uuid: currentUser.id
  };

  delete child.id; // ✅ ensure Supabase generates UUID

  const { data, error } = await supabase.from("users").insert([child]).select();

  if (error) {
    alert("Error adding child: " + error.message);
    return;
  }

  alert("Child account added successfully!");
  document.getElementById("addChildModal").style.display = "none";
}

// ✅ Add Event Listeners
document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "index.html";
    return;
  }

  // Populate fields
  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value = user.lastName || '';
  document.getElementById('newEmail').value = user.email || '';
  document.getElementById('avatarImage').src = user.avatarUrl || "images/logos/default.png";

  // ✅ Button Listeners
  document.getElementById("saveBtn").addEventListener("click", e => { e.preventDefault(); saveSettings(); });
  document.getElementById("cancelBtn").addEventListener("click", () => window.location.href = "index.html");
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("switchRoleBtn").addEventListener("click", promptRoleSwitch);
  document.getElementById("switchUserBtn").addEventListener("click", promptUserSwitch);

  // ✅ Add Child Button
  document.getElementById("addChildBtn").addEventListener("click", () => {
    document.getElementById("addChildModal").style.display = "flex";
  });
  document.getElementById("cancelChildBtn").addEventListener("click", () => {
    document.getElementById("addChildModal").style.display = "none";
  });
  document.getElementById("createChildBtn").addEventListener("click", createChildUser);

  // ✅ Avatar Upload
  document.getElementById("avatarImage").addEventListener("click", () => document.getElementById("avatarInput").click());
  document.getElementById("avatarInput").addEventListener("change", uploadAvatar);
});

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
    alert("Could not save settings: " + err.message);
  }
}

function handleLogout() {
  localStorage.clear();
  window.location.href = "login.html";
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
    btn.textContent = `${u.firstName} ${u.lastName}`;
    btn.onclick = () => {
      localStorage.setItem("loggedInUser", JSON.stringify(u));
      localStorage.setItem("activeRole", Array.isArray(u.roles) ? u.roles[0] : "student");
      window.location.href = "index.html";
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });
  document.getElementById("userSwitchModal").style.display = "flex";
}

async function uploadAvatar() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const file = document.getElementById("avatarInput").files[0];
  if (!file) return;
  const filePath = `public/${user.id}.${file.name.split('.').pop()}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
  if (uploadError) { alert("Avatar upload failed"); return; }
  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
  await supabase.from("users").update({ avatarUrl: urlData.publicUrl }).eq("id", user.id);
  user.avatarUrl = urlData.publicUrl;
  localStorage.setItem("loggedInUser", JSON.stringify(user));
  document.getElementById("avatarImage").src = urlData.publicUrl;
}
