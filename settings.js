
import { supabase } from './supabase.js';

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function promptUserSwitch() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const allUsers = JSON.parse(localStorage.getItem("allUsers")) || [];

  const userList = allUsers.filter(u =>
    u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()
  );

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
  const roleList = Array.isArray(user.roles) ? user.roles : [user.role];

  const listContainer = document.getElementById("roleSwitchList");
  listContainer.innerHTML = "";

  roleList.forEach(role => {
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

function closeUserSwitchModal() {
  document.getElementById("userSwitchModal").style.display = "none";
}

function closeRoleSwitchModal() {
  document.getElementById("roleSwitchModal").style.display = "none";
}

async function saveSettings() {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const updatedUser = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: document.getElementById('newEmail').value.trim()
  };

  try {
    const { error } = await supabase
      .from("users")
      .update(updatedUser)
      .eq("id", user.id);

    if (error) throw error;

    Object.assign(user, updatedUser);
    localStorage.setItem("loggedInUser", JSON.stringify(user));

    const msg = document.createElement("div");
    msg.textContent = "Settings saved!";
    msg.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#3eb7f8;color:white;padding:12px 20px;border-radius:10px;font-weight:bold;z-index:999;";
    document.body.appendChild(msg);
    setTimeout(() => location.assign("index.html"), 1000);
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

  const avatarImage = document.getElementById('avatarImage');
  avatarImage.src = user.avatarUrl || "images/logos/default.png";

  const switchRoleBtn = document.getElementById("switchRoleBtn");
  const switchUserBtn = document.getElementById("switchUserBtn");

  // Load all users for Switch User check
  try {
    const { data: allUsers, error } = await supabase.from("users").select("*");
    if (!error && Array.isArray(allUsers)) {
      localStorage.setItem("allUsers", JSON.stringify(allUsers));

      const sameEmailUsers = allUsers.filter(u =>
        u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()
      );

      if (sameEmailUsers.length > 1) {
        switchUserBtn.style.display = "inline-block";
      } else {
        switchUserBtn.style.display = "none";
      }
    }
  } catch {
    console.warn("Unable to load users for switch-user check.");
    switchUserBtn.style.display = "none";
  }

  if (Array.isArray(user.roles) && user.roles.length > 1) {
    switchRoleBtn.style.display = "inline-block";
    switchRoleBtn.textContent = `Switch Role (Currently: ${capitalize(activeRole)})`;
  } else {
    switchRoleBtn.style.display = "none";
  }

  // Avatar upload
  document.getElementById("avatarInput").addEventListener("change", async () => {
    const file = document.getElementById("avatarInput").files[0];
    if (!file) return;
    const filePath = `public/${user.id}.png`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicData, error: urlError } = supabase
        .storage
        .from("avatars")
        .getPublicUrl(filePath);

      if (urlError) throw urlError;

      const avatarUrl = publicData.publicUrl;
      user.avatarUrl = avatarUrl;
      avatarImage.src = avatarUrl;

      const { error: updateError } = await supabase
        .from("users")
        .update({ avatarUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      localStorage.setItem("loggedInUser", JSON.stringify(user));
    } catch (err) {
      console.error("Avatar upload error:", err);
      alert("Failed to upload avatar.");
    }
  });

  document.getElementById("avatarImage").addEventListener("click", () => {
    document.getElementById("avatarInput").click();
  });

  document.getElementById("saveBtn").addEventListener("click", (e) => {
    e.preventDefault();
    saveSettings();
  });
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("cancelBtn").addEventListener("click", () => window.location.href = "index.html");
  document.getElementById("switchRoleBtn").addEventListener("click", promptRoleSwitch);
  document.getElementById("switchUserBtn").addEventListener("click", promptUserSwitch);
  document.getElementById("cancelUserSwitchBtn").addEventListener("click", closeUserSwitchModal);
  document.getElementById("cancelRoleSwitchBtn").addEventListener("click", closeRoleSwitchModal);
});
