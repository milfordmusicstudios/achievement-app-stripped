import { supabase } from "./supabaseClient.js";
import { clearAppSessionCache, ensureUserRow, getAuthUserId, getViewerContext } from "./utils.js";
import { applyTeacherOptionsToSelect, loadTeachersForStudio, parseRoles, showToast } from "./settings-shared.js";

let authUserId = null;
let activeStudioId = null;
let authProfile = null;
let teacherOptions = [];
let isAccountEditing = false;

function getHighestRole(roles) {
  const priority = { admin: 3, teacher: 2, student: 1, parent: 0 };
  if (!Array.isArray(roles)) return "student";
  return roles.slice().sort((a, b) => (priority[b?.toLowerCase()] ?? -1) - (priority[a?.toLowerCase()] ?? -1))[0];
}

function setTeacherError(message) {
  const errorEl = document.getElementById("accountTeacherError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function setPasswordError(message) {
  const errorEl = document.getElementById("passwordError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function setAccountEditing(editing) {
  isAccountEditing = editing;
  const fields = ["accountFirstName", "accountLastName", "accountEmail", "accountTeacherIds"];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !editing;
  });

  const actions = document.getElementById("accountActions");
  if (actions) actions.style.display = editing ? "flex" : "none";

  const editBtn = document.getElementById("accountEditBtn");
  if (editBtn) editBtn.disabled = editing;
}

function fillAccountFields(profile) {
  const firstName = document.getElementById("accountFirstName");
  const lastName = document.getElementById("accountLastName");
  const email = document.getElementById("accountEmail");
  if (firstName) firstName.value = profile?.firstName || "";
  if (lastName) lastName.value = profile?.lastName || "";
  if (email) email.value = profile?.email || "";
}

function clearActiveStudentCacheIfStudent(roles) {
  if (!Array.isArray(roles)) return;
  const normalized = roles.map(r => String(r).toLowerCase());
  if (!normalized.includes("student")) return;
  const studioId = activeStudioId || localStorage.getItem("activeStudioId");
  if (studioId && authUserId) {
    localStorage.removeItem(`aa.activeStudent.${studioId}.${authUserId}`);
  }
  localStorage.removeItem("activeStudentId");
}

function promptRoleSwitch(roles) {
  const listContainer = document.getElementById("roleSwitchList");
  if (!listContainer) return;
  listContainer.innerHTML = "";
  roles.forEach(role => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "blue-button";
    btn.style = "margin: 5px 0; width: 100%;";
    btn.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    btn.onclick = () => {
      localStorage.setItem("activeRole", role);
      clearActiveStudentCacheIfStudent([role]);
      window.location.href = "index.html";
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });
  document.getElementById("roleSwitchModal").classList.add("is-open");
}

async function saveAccountInfo() {
  if (!authProfile) return;
  setTeacherError("");

  const updatedUser = {
    firstName: (document.getElementById("accountFirstName")?.value || "").trim(),
    lastName: (document.getElementById("accountLastName")?.value || "").trim(),
    email: (document.getElementById("accountEmail")?.value || "").trim() || authProfile.email
  };

  const roleList = parseRoles(authProfile.roles || authProfile.role);
  if (roleList.includes("student")) {
    const teacherSelect = document.getElementById("accountTeacherIds");
    const teacherIds = Array.from(teacherSelect?.selectedOptions || []).map(o => o.value);
    if (teacherOptions.length > 0 && teacherIds.length === 0) {
      setTeacherError("Please select your teacher.");
      return;
    }
    updatedUser.teacherIds = teacherIds;
  }

  const { error: dbError } = await supabase.from("users").update(updatedUser).eq("id", authProfile.id);
  if (dbError) {
    console.error("[Settings] failed to update account", dbError);
    showToast("Failed to update account.");
    return;
  }

  if (updatedUser.email && updatedUser.email !== authProfile.email) {
    const { error: emailErr } = await supabase.auth.updateUser({ email: updatedUser.email });
    if (emailErr) {
      console.error("[Settings] failed to update email", emailErr);
      showToast("Failed to update email.");
      return;
    }
    showToast("Check your new email to confirm the change.");
  } else {
    showToast("Account updated.");
  }

  authProfile = { ...authProfile, ...updatedUser };
  localStorage.setItem("loggedInUser", JSON.stringify(authProfile));
  setAccountEditing(false);
}

async function savePasswordChange() {
  setPasswordError("");
  const currentPassword = (document.getElementById("currentPassword")?.value || "").trim();
  const newPassword = (document.getElementById("newPassword")?.value || "").trim();
  const confirmPassword = (document.getElementById("confirmNewPassword")?.value || "").trim();

  if (!currentPassword || !newPassword) {
    setPasswordError("Please fill in all password fields.");
    return;
  }
  if (newPassword !== confirmPassword) {
    setPasswordError("New passwords do not match.");
    return;
  }

  const { data: authData } = await supabase.auth.getUser();
  const email = authData?.user?.email || authProfile?.email;
  if (!email) {
    setPasswordError("Missing account email. Please log in again.");
    return;
  }

  const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthErr) {
    setPasswordError("Incorrect current password.");
    return;
  }

  const { error: passErr } = await supabase.auth.updateUser({ password: newPassword });
  if (passErr) {
    console.error("[Settings] password update failed", passErr);
    setPasswordError("Failed to update password.");
    return;
  }

  showToast("Password updated.");
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmNewPassword").value = "";
  document.getElementById("passwordBody").style.display = "none";
}

function wirePasswordToggles() {
  document.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "Show" : "Hide";
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  authUserId = await getAuthUserId();
  if (!authUserId) {
    window.location.replace("./login.html");
    return;
  }

  const viewerContext = await getViewerContext();
  activeStudioId = viewerContext?.studioId || localStorage.getItem("activeStudioId");

  const ensured = await ensureUserRow();
  if (ensured && String(ensured.id) === String(authUserId)) {
    authProfile = ensured;
  }

  if (!authProfile) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUserId)
      .single();
    if (error || !data) {
      console.error("[Settings] failed to load auth profile", error);
      showToast("Failed to load account.");
      return;
    }
    authProfile = data;
  }

  fillAccountFields(authProfile);
  setAccountEditing(false);

  const roleList = parseRoles(authProfile.roles || authProfile.role);
  teacherOptions = await loadTeachersForStudio(activeStudioId);
  const teacherWrap = document.getElementById("accountTeacherWrap");
  const teacherSelect = document.getElementById("accountTeacherIds");
  if (roleList.includes("student")) {
    if (teacherWrap) teacherWrap.style.display = "";
    applyTeacherOptionsToSelect(teacherSelect, teacherOptions);
    const selectedIds = Array.isArray(authProfile.teacherIds) ? authProfile.teacherIds.map(String) : [authProfile.teacherIds].filter(Boolean).map(String);
    selectedIds.forEach(id => {
      const opt = Array.from(teacherSelect.options).find(o => o.value === id);
      if (opt) opt.selected = true;
    });
    if (teacherSelect) teacherSelect.addEventListener("change", () => setTeacherError(""));
  } else if (teacherWrap) {
    teacherWrap.style.display = "none";
  }

  const editBtn = document.getElementById("accountEditBtn");
  const accountSaveBtn = document.getElementById("accountSaveBtn");
  const accountCancelBtn = document.getElementById("accountCancelBtn");

  if (editBtn) editBtn.addEventListener("click", () => setAccountEditing(true));
  if (accountSaveBtn) accountSaveBtn.addEventListener("click", saveAccountInfo);
  if (accountCancelBtn) {
    accountCancelBtn.addEventListener("click", () => {
      fillAccountFields(authProfile);
      if (teacherSelect && Array.isArray(authProfile.teacherIds)) {
        const selectedIds = authProfile.teacherIds.map(String);
        Array.from(teacherSelect.options).forEach(opt => {
          opt.selected = selectedIds.includes(opt.value);
        });
      }
      setAccountEditing(false);
      setTeacherError("");
    });
  }

  const passwordToggleBtn = document.getElementById("passwordToggleBtn");
  const passwordBody = document.getElementById("passwordBody");
  if (passwordToggleBtn && passwordBody) {
    passwordToggleBtn.addEventListener("click", () => {
      const showing = passwordBody.style.display === "none";
      passwordBody.style.display = showing ? "block" : "none";
      passwordToggleBtn.textContent = showing ? "Hide Password" : "Change Password";
    });
  }

  const passwordSaveBtn = document.getElementById("passwordSaveBtn");
  const passwordCancelBtn = document.getElementById("passwordCancelBtn");
  if (passwordSaveBtn) passwordSaveBtn.addEventListener("click", savePasswordChange);
  if (passwordCancelBtn) {
    passwordCancelBtn.addEventListener("click", () => {
      document.getElementById("currentPassword").value = "";
      document.getElementById("newPassword").value = "";
      document.getElementById("confirmNewPassword").value = "";
      passwordBody.style.display = "none";
      setPasswordError("");
    });
  }

  wirePasswordToggles();

  const switchRoleBtn = document.getElementById("switchRoleBtn");
  if (switchRoleBtn) {
    switchRoleBtn.style.display = roleList.length > 1 ? "inline-block" : "none";
    switchRoleBtn.addEventListener("click", () => promptRoleSwitch(roleList));
  }
  const cancelRoleSwitchBtn = document.getElementById("cancelRoleSwitchBtn");
  if (cancelRoleSwitchBtn) {
    cancelRoleSwitchBtn.addEventListener("click", () => {
      document.getElementById("roleSwitchModal").classList.remove("is-open");
    });
  }
  const roleModal = document.getElementById("roleSwitchModal");
  if (roleModal) {
    roleModal.addEventListener("click", (e) => {
      if (e.target === roleModal) roleModal.classList.remove("is-open");
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      await clearAppSessionCache("logout");
      window.location.href = "login.html";
    });
  }
});
