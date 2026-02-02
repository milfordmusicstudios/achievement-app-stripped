import { supabase } from "./supabaseClient.js";
import { clearAppSessionCache, ensureUserRow, getAuthUserId, getViewerContext } from "./utils.js";
import { applyTeacherOptionsToSelect, loadTeachersForStudio, parseRoles, showToast } from "./settings-shared.js";

let authUserId = null;
let activeStudioId = null;
let authProfile = null;
let teacherOptions = [];
let isAccountEditing = false;
let isRecoveryMode = false;

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

function setRecoveryError(message) {
  const errorEl = document.getElementById("passwordRecoveryError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function detectRecoveryFromUrl() {
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.get("type") === "recovery") return true;

    const hash = (window.location.hash || "").replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get("type") === "recovery") return true;
  } catch (err) {
    console.debug("[Settings] unable to detect recovery params", err);
  }
  return false;
}

function setRecoveryMode(enabled) {
  if (isRecoveryMode === enabled) {
    return;
  }
  isRecoveryMode = enabled;
  const actionsCard = document.getElementById("actionsCard");
  const recoveryCard = document.getElementById("passwordRecoveryCard");
  if (actionsCard) actionsCard.style.display = enabled ? "none" : "";
  if (recoveryCard) recoveryCard.style.display = enabled ? "" : "none";

  const passwordBody = document.getElementById("passwordBody");
  if (passwordBody && enabled) passwordBody.style.display = "none";

  const recoveryFields = ["recoveryNewPassword", "recoveryConfirmPassword"];
  if (!enabled) {
    recoveryFields.forEach(id => {
      const field = document.getElementById(id);
      if (field) field.value = "";
    });
  }

  setRecoveryError("");
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

async function handleRecoverySubmit() {
  setRecoveryError("");
  const newPassword = (document.getElementById("recoveryNewPassword")?.value || "").trim();
  const confirmPassword = (document.getElementById("recoveryConfirmPassword")?.value || "").trim();

  if (!newPassword || !confirmPassword) {
    setRecoveryError("Please fill in both password fields.");
    return;
  }

  if (newPassword.length < 8) {
    setRecoveryError("Password must be at least 8 characters.");
    return;
  }

  if (newPassword !== confirmPassword) {
    setRecoveryError("New passwords do not match.");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.error("[Settings] recovery password update failed", error);
    setRecoveryError("Failed to update password.");
    return;
  }

  showToast("Password updated. You're all set.");
  setRecoveryMode(false);
  setTimeout(() => {
    window.location.href = "index.html";
  }, 1400);
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
  const recoveryDetected = detectRecoveryFromUrl();
  if (recoveryDetected) {
    console.debug("[Settings] recovery mode detected via URL");
    setRecoveryMode(true);
  }

  supabase.auth.onAuthStateChange(event => {
    console.debug("[Settings] auth event:", event);
    if (event === "PASSWORD_RECOVERY") {
      setRecoveryMode(true);
    }
  });

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

  const recoverySaveBtn = document.getElementById("recoveryPasswordSaveBtn");
  if (recoverySaveBtn) {
    recoverySaveBtn.addEventListener("click", handleRecoverySubmit);
  }

  wirePasswordToggles();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await window.getSupabaseClient()?.auth.signOut();
      await clearAppSessionCache("logout");
      window.location.href = "login.html";
    });
  }
});
