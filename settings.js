import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // ✅ Normalize roles for Switch Role button
  const roles = Array.isArray(user.roles)
    ? user.roles
    : (user.roles ? user.roles.toString().split(",").map(r => r.trim()) : []);

  const switchRoleBtn = document.getElementById("switchRoleBtn");
  const switchUserBtn = document.getElementById("switchUserBtn");

  // ✅ Switch Role Button Visibility
  if (roles.length > 1) {
    switchRoleBtn.style.display = "inline-block";
    switchRoleBtn.textContent = `Switch Role (Current: ${capitalize(activeRole)})`;
  } else {
    switchRoleBtn.style.display = "none";
  }

  // ✅ Switch User Button Visibility (always show if needed)
  if (switchUserBtn) {
    const allUsers = JSON.parse(localStorage.getItem("allUsers")) || [];
    const matchingUsers = allUsers.filter(u => u.email?.toLowerCase() === user.email?.toLowerCase());
    switchUserBtn.style.display = matchingUsers.length > 1 ? "inline-block" : "inline-block";
  }

  // ✅ Populate existing fields
  document.getElementById("firstName").value = user.firstName || "";
  document.getElementById("lastName").value = user.lastName || "";
  document.getElementById("newEmail").value = user.email || "";

  // ✅ Avatar Logic
  const avatarImage = document.getElementById("avatarImage");
  avatarImage.src = user.avatarUrl || "images/logos/default.png";

  const avatarInput = document.getElementById("avatarInput");
  avatarImage.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;

    const fileName = `${user.id}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      alert("Avatar upload failed.");
    } else {
      const { data: publicURL } = supabase.storage.from("avatars").getPublicUrl(fileName);
      avatarImage.src = publicURL.publicUrl;
      localStorage.setItem("loggedInUser", JSON.stringify({ ...user, avatarUrl: publicURL.publicUrl }));
      await supabase.from("users").update({ avatarUrl: publicURL.publicUrl }).eq("id", user.id);
    }
  });

  // ✅ Save Button
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault(); // ✅ Prevent form reload
      const firstName = document.getElementById("firstName").value.trim();
      const lastName = document.getElementById("lastName").value.trim();

      const { data, error } = await supabase.from("users")
        .update({ firstName, lastName })
        .eq("id", user.id);

      if (error) {
        console.error("Supabase Error:", error);
        alert("Failed to update name.");
      } else {
        alert("Name updated successfully.");
        localStorage.setItem("loggedInUser", JSON.stringify({ ...user, firstName, lastName }));
      }
    });
  }

  // ✅ Update Credentials
  const updateBtn = document.getElementById("updateCredentialsBtn");
  if (updateBtn) {
    updateBtn.addEventListener("click", async () => {
      const newEmail = document.getElementById("newEmail").value.trim();
      const newPassword = document.getElementById("newPassword").value.trim();

      const updates = {};
      if (newEmail && newEmail !== user.email) updates.email = newEmail;
      if (newPassword) updates.password = newPassword;

      if (Object.keys(updates).length === 0) {
        alert("No changes detected.");
        return;
      }

      const { error } = await supabase.from("users").update(updates).eq("id", user.id);
      if (error) {
        console.error(error);
        alert("Failed to update credentials.");
      } else {
        alert("Credentials updated successfully.");
        localStorage.setItem("loggedInUser", JSON.stringify({ ...user, ...updates }));
      }
    });
  }

  // ✅ Cancel Button → Home
  const cancelBtn = document.getElementById("cancelBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  // ✅ Logout Button → Login and Clear Session
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.clear();
      window.location.href = "login.html";
    });
  }

  // ✅ Switch Role Button
  if (switchRoleBtn) {
    switchRoleBtn.addEventListener("click", () => {
      const nextRole = roles.find(r => r !== activeRole) || roles[0];
      localStorage.setItem("activeRole", nextRole);
      alert(`Switched to ${capitalize(nextRole)} role.`);
      window.location.reload();
    });
  }

  // ✅ Switch User Button
  if (switchUserBtn) {
    switchUserBtn.addEventListener("click", () => {
      window.location.href = "switch-user.html";
    });
  }
});

// ✅ Helper
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}
