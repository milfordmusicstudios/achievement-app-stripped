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
    if (normalizeUUID(u.id) === userIdStr && !u.isParentView) return;

    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "blue-button";
    btn.style = "margin: 5px 0; width: 100%;";

    btn.textContent = u.displayName 
      ? u.displayName 
      : `${u.firstName} ${u.lastName} (${Array.isArray(u.roles) ? u.roles.join(", ") : ""})`;

btn.onclick = () => {
  const userToStore = { ...u };
  delete userToStore.isParentView;
  localStorage.setItem("loggedInUser", JSON.stringify(userToStore));
  const defaultRole = Array.isArray(u.roles) ? u.roles[0] : "student";
  localStorage.setItem("activeRole", defaultRole);

if (u.isParentView) {
  sessionStorage.setItem("parentModalShown", "true"); // ✅ prevents loops
} else {
  sessionStorage.removeItem("parentModalShown"); // ✅ for students
}

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

    // ✅ 1. Auth update only if something changed
    if (emailChanged || passwordChanged) {
      const { error: authError } = await supabase.auth.updateUser({
        email: emailChanged ? newEmail : undefined,
        password: passwordChanged ? newPassword : undefined
      });
      if (authError) {
        console.warn("[WARN] Auth update failed:", authError.message);
        alert("Warning: " + authError.message);
      } else {
        console.log("[DEBUG] Auth credentials updated successfully");
        if (emailChanged) {
          alert("Check your new email to confirm the change. Email will not update until verified.");
        }
      }
    }

    // ✅ 2. Update users table metadata
    const { error: dbError } = await supabase
      .from("users")
      .update(updatedUser)
      .eq("id", user.id);
    if (dbError) throw dbError;

    // ✅ 3. Save locally
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

  // ✅ Load related users and build list
  const relatedUsers = await fetchRelatedUsers(user);
  let existingAllUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
  const updatedAllUsers = [...existingAllUsers];

  // Always include current user
  if (!updatedAllUsers.some(u => u.id === user.id)) {
    updatedAllUsers.push(user);
  }

  // Add children
  relatedUsers.forEach(ru => {
    if (!updatedAllUsers.some(u => u.id === ru.id)) {
      updatedAllUsers.push(ru);
    }
  });

  // ✅ If teacher/admin with children, add a parent view entry
  const hasChildren = relatedUsers.length > 0;
  const hasStaffRole = (user.roles || []).some(r => ["teacher", "admin"].includes(r.toLowerCase()));
  if (hasChildren && hasStaffRole) {
    updatedAllUsers.push({
      ...user,
      displayName: `${user.firstName} ${user.lastName} (Parent View)`,
      isParentView: true,
      roles: ["parent"]
    });
  }

  localStorage.setItem("allUsers", JSON.stringify(updatedAllUsers));

  // ✅ Show/hide buttons
  document.getElementById("switchUserBtn").style.display = (updatedAllUsers.length > 1) ? "inline-block" : "none";
  document.getElementById("switchRoleBtn").style.display = (user.roles?.length > 1) ? "inline-block" : "none";

  // ✅ Event bindings
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
