
import { supabase } from './supabase.js';

function getHighestRole(roles) {
  const priority = { admin: 3, teacher: 2, student: 1, parent: 0 };
  if (!Array.isArray(roles)) return "student";
  return roles.slice().sort((a, b) => (priority[b.toLowerCase()] ?? -1) - (priority[a.toLowerCase()] ?? -1))[0];
}

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

    btn.textContent = `${u.firstName} ${u.lastName} (${Array.isArray(u.roles) ? u.roles.join(", ") : ""})`;

    btn.onclick = () => {
      const userToStore = { ...u };
      localStorage.setItem("loggedInUser", JSON.stringify(userToStore));
localStorage.setItem("activeRole", getHighestRole(u.roles));
      window.location.href = "index.html";
    };

    li.appendChild(btn);
    listContainer.appendChild(li);
  });

  document.getElementById("userSwitchModal").style.display = "flex";
}

function promptRoleSwitch() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
const roles = (Array.isArray(user.roles) ? user.roles : [user.role])
  .filter(r => r.toLowerCase() !== "parent");
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
  const currentEmail = user.email;
  const newEmail = document.getElementById('newEmail').value.trim();
  const newPassword = document.getElementById('newPassword').value.trim();

  const updatedUser = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: newEmail || currentEmail
  };

  try {
    let emailChanged = newEmail && newEmail !== currentEmail;
    let passwordChanged = newPassword && newPassword.length > 0;

    if (emailChanged || passwordChanged) {
      const { error: authError } = await supabase.auth.updateUser({
        email: emailChanged ? newEmail : undefined,
        password: passwordChanged ? newPassword : undefined
      });
      if (authError) {
        console.warn("[WARN] Auth update failed:", authError.message);
        alert("Warning: " + authError.message);
      } else if (emailChanged) {
        alert("Check your new email to confirm the change.");
      }
    }

    const { error: dbError } = await supabase.from("users").update(updatedUser).eq("id", user.id);
    if (dbError) throw dbError;

    Object.assign(user, updatedUser);
    localStorage.setItem("loggedInUser", JSON.stringify(user));
    alert("Settings saved successfully!");
    window.location.href = "index.html";
  } catch (err) {
    console.error("[ERROR] Save settings failed:", err);
    alert("Failed to update settings: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
let activeRole = localStorage.getItem("activeRole");
if (!activeRole && user.roles) {
  activeRole = getHighestRole(user.roles);
  localStorage.setItem("activeRole", activeRole);
}
  if (!user || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "index.html";
    return;
  }

  // ✅ Avatar Help Modal Logic
  const helpLink = document.getElementById("howToAvatar");
  const helpModal = document.getElementById("avatarHelpModal");
  const closeHelpBtn = document.getElementById("closeAvatarHelp");

  helpLink.addEventListener("click", () => helpModal.classList.add("show"));
  closeHelpBtn.addEventListener("click", () => helpModal.classList.remove("show"));
  helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) helpModal.classList.remove("show");
  });
// ✅ Add Cancel Listeners for Switch User and Switch Role
const cancelUserSwitchBtn = document.getElementById("cancelUserSwitchBtn");
const cancelRoleSwitchBtn = document.getElementById("cancelRoleSwitchBtn");
const userSwitchModal = document.getElementById("userSwitchModal");
const roleSwitchModal = document.getElementById("roleSwitchModal");

if (cancelUserSwitchBtn) {
  cancelUserSwitchBtn.addEventListener("click", () => {
    userSwitchModal.style.display = "none";
  });
}

if (cancelRoleSwitchBtn) {
  cancelRoleSwitchBtn.addEventListener("click", () => {
    roleSwitchModal.style.display = "none";
  });
}

// ✅ Optional: Close when clicking outside modal content
userSwitchModal?.addEventListener("click", (e) => {
  if (e.target === userSwitchModal) userSwitchModal.style.display = "none";
});

roleSwitchModal?.addEventListener("click", (e) => {
  if (e.target === roleSwitchModal) roleSwitchModal.style.display = "none";
});

  // ✅ Populate user data
  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value = user.lastName || '';
  document.getElementById('newEmail').value = user.email || '';
  document.getElementById('avatarImage').src = user.avatarUrl || "images/logos/default.png";

  // ✅ Setup user list and buttons
  let updatedAllUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
  if (!updatedAllUsers.some(u => u.id === user.id)) updatedAllUsers.push(user);

  const relatedUsers = await fetchRelatedUsers(user);
  relatedUsers.forEach(ru => {
    if (!updatedAllUsers.some(u => u.id === ru.id)) updatedAllUsers.push(ru);
  });

  updatedAllUsers = updatedAllUsers.filter((v,i,a)=>a.findIndex(t=>(t.id===v.id))===i);
  localStorage.setItem("allUsers", JSON.stringify(updatedAllUsers));

  document.getElementById("switchUserBtn").style.display = (updatedAllUsers.length > 1) ? "inline-block" : "none";
  document.getElementById("switchRoleBtn").style.display = (user.roles?.length > 1) ? "inline-block" : "none";

  // ✅ Event Listeners
  document.getElementById("logoutBtn").addEventListener("click", () => { localStorage.clear(); window.location.href = "login.html"; });
  document.getElementById("cancelBtn").addEventListener("click", () => window.location.href = "index.html");
  document.getElementById("switchRoleBtn").addEventListener("click", promptRoleSwitch);
  document.getElementById("switchUserBtn").addEventListener("click", promptUserSwitch);
  document.getElementById("saveBtn").addEventListener("click", (e) => { e.preventDefault(); saveSettings(); });

  // ✅ Auto open user switch modal if required
  if (sessionStorage.getItem("forceUserSwitch") === "true") {
    sessionStorage.removeItem("forceUserSwitch");
    setTimeout(() => promptUserSwitch(), 400);
  }
});