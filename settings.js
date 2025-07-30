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

  // ✅ Load related users
  const relatedUsers = await fetchRelatedUsers(user);
  let existingAllUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
  const updatedAllUsers = [...existingAllUsers];
  if (!updatedAllUsers.some(u => u.id === user.id)) updatedAllUsers.push(user);
  relatedUsers.forEach(ru => { if (!updatedAllUsers.some(u => u.id === ru.id)) updatedAllUsers.push(ru); });
  localStorage.setItem("allUsers", JSON.stringify(updatedAllUsers));

  // ✅ Show/hide buttons
  document.getElementById("switchUserBtn").style.display = (updatedAllUsers.length > 1) ? "inline-block" : "none";
  document.getElementById("switchRoleBtn").style.display = (user.roles?.length > 1) ? "inline-block" : "none";

  // ✅ Button events
  document.getElementById("logoutBtn").addEventListener("click", () => { localStorage.clear(); window.location.href = "login.html"; });
  document.getElementById("cancelBtn").addEventListener("click", () => window.location.href = "index.html");
  document.getElementById("switchRoleBtn").addEventListener("click", promptRoleSwitch);
  document.getElementById("switchUserBtn").addEventListener("click", promptUserSwitch);

  // ✅ Auto-trigger modal if coming from parent redirect
  if (sessionStorage.getItem("forceUserSwitch") === "true") {
    console.log("[DEBUG] Forcing user switch modal...");
    sessionStorage.removeItem("forceUserSwitch");
    setTimeout(() => promptUserSwitch(), 400);
  }
});
