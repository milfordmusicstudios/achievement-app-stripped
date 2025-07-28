import { supabase } from './supabase.js';

function normalizeUUID(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

// ✅ UUID generator for new child accounts
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ✅ Load teacher options into the child modal
async function loadChildTeachers() {
  const { data: teachers, error } = await supabase.from("users").select("id, firstName, lastName, roles");
  if (error) {
    console.error("Error loading teachers:", error);
    return;
  }

  const teacherList = teachers.filter(t => Array.isArray(t.roles) && (t.roles.includes("teacher") || t.roles.includes("admin")));
  const container = document.getElementById("childTeacherTags");
  container.innerHTML = "";

  teacherList.forEach(t => {
    const tag = document.createElement("span");
    tag.className = "tag teacher-tag";
    tag.dataset.id = t.id;
    tag.textContent = `${t.firstName} ${t.lastName}`;
    tag.addEventListener("click", () => {
      tag.classList.toggle("selected");
    });
    container.appendChild(tag);
  });
}

// ✅ Create child user in Supabase
async function createChildUser() {
  const currentUser = JSON.parse(localStorage.getItem("loggedInUser"));

const teacherIds = Array.from(document.querySelectorAll("#childTeacherTags .teacher-tag.selected"))
  .map(tag => tag.dataset.id);

  const child = {
    id: generateUUID(), // ✅ unique ID
    firstName: document.getElementById("childFirstName").value.trim(),
    lastName: document.getElementById("childLastName").value.trim(),
    email: currentUser.email, // ✅ use parent’s email
    instrument: [document.getElementById("childInstrument").value.trim()],
    roles: ["student"],
    teacherIds,
    parent_uuid: currentUser.id // ✅ link child to parent
  };

  const { error } = await supabase.from("users").insert([child]);
  if (error) {
    alert("Error adding child: " + error.message);
    return;
  }

  alert("Child account added successfully!");
  document.getElementById("addChildModal").style.display = "none";
}

// ✅ Save user settings
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

// ✅ Logout
function handleLogout() {
  localStorage.clear();
  window.location.href = "login.html";
}

// ✅ Role Switch
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

// ✅ User Switch
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

// ✅ Avatar Upload
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

// ✅ DOM Ready
document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "index.html";
    return;
  }

  // ✅ Populate user info
  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value = user.lastName || '';
  document.getElementById('newEmail').value = user.email || '';
  document.getElementById('avatarImage').src = user.avatarUrl || "images/logos/default.png";

  // ✅ Event bindings
  document.getElementById("saveBtn").addEventListener("click", e => { e.preventDefault(); saveSettings(); });
  document.getElementById("cancelBtn").addEventListener("click", () => window.location.href = "index.html");
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("switchRoleBtn").addEventListener("click", promptRoleSwitch);
  document.getElementById("switchUserBtn").addEventListener("click", promptUserSwitch);

  // ✅ Child Modal Events
  document.getElementById("addChildBtn").addEventListener("click", async () => {
    await loadChildTeachers();
    document.getElementById("addChildModal").style.display = "flex";
  });
  document.getElementById("cancelChildBtn").addEventListener("click", () => {
    document.getElementById("addChildModal").style.display = "none";
  });
  document.getElementById("createChildBtn").addEventListener("click", createChildUser);

  // ✅ Avatar Click
  document.getElementById("avatarImage").addEventListener("click", () => document.getElementById("avatarInput").click());
  document.getElementById("avatarInput").addEventListener("change", uploadAvatar);
});
