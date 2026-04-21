import { supabase } from './supabaseClient.js';
import { getActiveStudioIdForUser, getAuthUserId } from "./utils.js";
import { isAccountHolder } from "./permissions.js";
import { showToast } from "./settings-shared.js";

function setStatus(message, { isError = false } = {}) {
  const statusEl = document.getElementById("studioSettingsStatus");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.classList.toggle("settings-error", isError);
}

function safeCheck(id, exists) {
  const el = document.getElementById(id);
  if (!el || typeof exists !== "boolean") return;
  el.checked = exists;
}

function safeSetValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value ?? "";
}

const TOGGLE_IDS = [
  "adminsCanManageUsers",
  "adminsCanManageStudents",
  "adminsCanManageTeachers",
  "teacherCanLogPoints",
  "teacherCanApproveLogs",
  "teacherCanCreateChallenges",
  "teacherChallengesRequireApproval",
  "adminOnLogSubmitted",
  "adminOnLogFlagged",
  "adminOnLevelUp",
  "badgesEnabled",
  "studentLogTypeFinishBook",
  "studentLogTypeGroupClass",
  "studentLogTypeStudioPerformance",
  "studentLogTypeOutsidePerformance",
  "studentLogTypeCompetition",
  "studentLogTypeFestival",
  "studentLogTypeMemorization",
  "studentLogTypeTheoryTechnique",
  "studentLogTypePersonalGoal"
];

let createChallengesCheckbox;
let approvalCheckbox;
let approvalRow;
let leaderboardStudioRadio;
let leaderboardGlobalRadio;
let scopeToggleButton;
let activeStudioId = null;
let isStudioOwner = false;
let currentStudioSettings = {};
let customStudentLogTypeRows = [];

const STUDENT_LOG_TYPE_PRESETS = [
  { key: "finishBook", inputId: "studentLogTypeFinishBook" },
  { key: "groupClass", inputId: "studentLogTypeGroupClass" },
  { key: "studioPerformance", inputId: "studentLogTypeStudioPerformance" },
  { key: "outsidePerformance", inputId: "studentLogTypeOutsidePerformance" },
  { key: "competition", inputId: "studentLogTypeCompetition" },
  { key: "festival", inputId: "studentLogTypeFestival" },
  { key: "memorization", inputId: "studentLogTypeMemorization" },
  { key: "theoryTechniqueTest", inputId: "studentLogTypeTheoryTechnique" },
  { key: "personalGoal", inputId: "studentLogTypePersonalGoal" }
];

const STUDIO_SETTINGS_TOGGLE_PATHS = {
  teacherCanLogPoints: ["permissions", "teacherCanLogPoints"],
  teacherCanApproveLogs: ["permissions", "teacherCanApproveLogs"],
  teacherCanCreateChallenges: ["permissions", "teacherCanCreateChallenges"],
  teacherChallengesRequireApproval: ["challenges", "teacherChallengesRequireApproval"],
  adminOnLogSubmitted: ["notifications", "adminOnLogSubmitted"],
  adminOnLogFlagged: ["notifications", "adminOnLogFlagged"],
  adminOnLevelUp: ["notifications", "adminOnLevelUp"],
  badgesEnabled: ["badges", "enabled"],
  studentLogTypeFinishBook: ["studentLogTypes", "presets", "finishBook"],
  studentLogTypeGroupClass: ["studentLogTypes", "presets", "groupClass"],
  studentLogTypeStudioPerformance: ["studentLogTypes", "presets", "studioPerformance"],
  studentLogTypeOutsidePerformance: ["studentLogTypes", "presets", "outsidePerformance"],
  studentLogTypeCompetition: ["studentLogTypes", "presets", "competition"],
  studentLogTypeFestival: ["studentLogTypes", "presets", "festival"],
  studentLogTypeMemorization: ["studentLogTypes", "presets", "memorization"],
  studentLogTypeTheoryTechnique: ["studentLogTypes", "presets", "theoryTechniqueTest"],
  studentLogTypePersonalGoal: ["studentLogTypes", "presets", "personalGoal"]
};

const ADMIN_PERMISSION_FIELDS = {
  adminsCanManageUsers: "admins_can_manage_users",
  adminsCanManageStudents: "admins_can_manage_students",
  adminsCanManageTeachers: "admins_can_manage_teachers"
};

function isMissingRowError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "PGRST116" || /0 rows/i.test(msg);
}

function getDefaultAdminPermissions() {
  return {
    admins_can_manage_users: false,
    admins_can_manage_students: false,
    admins_can_manage_teachers: false
  };
}

function getDefaultStudentLogTypePresets() {
  return {
    finishBook: true,
    groupClass: true,
    studioPerformance: true,
    outsidePerformance: true,
    competition: true,
    festival: true,
    memorization: true,
    theoryTechniqueTest: true,
    personalGoal: true
  };
}

function normalizeCustomStudentLogTypes(rawTypes) {
  if (!Array.isArray(rawTypes)) return [];
  return rawTypes
    .map((item) => {
      const id = String(item?.id || "").trim() || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const label = String(item?.label || "").trim();
      const category = String(item?.category || "").trim().toLowerCase();
      const points = Number(item?.points);
      if (!label || !category || !Number.isFinite(points) || points <= 0) return null;
      return { id, label, category, points: Math.round(points), enabled: item?.enabled !== false };
    })
    .filter(Boolean);
}

function applyAdminPermissionValues(row) {
  const values = row || getDefaultAdminPermissions();
  safeCheck("adminsCanManageUsers", Boolean(values.admins_can_manage_users));
  safeCheck("adminsCanManageStudents", Boolean(values.admins_can_manage_students));
  safeCheck("adminsCanManageTeachers", Boolean(values.admins_can_manage_teachers));
}

function setAdminPermissionsReadonly(readonly) {
  const note = document.getElementById("adminPermissionsOwnerNote");
  if (note) note.style.display = readonly ? "" : "none";
  Object.keys(ADMIN_PERMISSION_FIELDS).forEach(id => {
    const checkbox = document.getElementById(id);
    const button = document.querySelector(`[data-toggle-target="${id}"]`);
    if (checkbox) checkbox.disabled = readonly;
    if (button) button.disabled = readonly;
  });
}

function setAdminPermissionsBusy(isBusy) {
  Object.keys(ADMIN_PERMISSION_FIELDS).forEach(id => {
    const button = document.querySelector(`[data-toggle-target="${id}"]`);
    if (button) button.disabled = isBusy || !isStudioOwner;
  });
}

async function loadAdminPermissions(studioId) {
  const { data, error } = await supabase
    .from("studio_permissions")
    .select("admins_can_manage_users,admins_can_manage_students,admins_can_manage_teachers")
    .eq("studio_id", studioId)
    .single();

  if (!error) return data;

  if (!isMissingRowError(error)) {
    throw error;
  }

  if (!isStudioOwner) {
    return getDefaultAdminPermissions();
  }

  const defaults = {
    studio_id: studioId,
    ...getDefaultAdminPermissions()
  };
  const { data: inserted, error: insertError } = await supabase
    .from("studio_permissions")
    .insert(defaults)
    .select("admins_can_manage_users,admins_can_manage_students,admins_can_manage_teachers")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted;
}

function updateChallengeUI() {
  const enabled = createChallengesCheckbox?.checked;
  if (approvalCheckbox) approvalCheckbox.disabled = !enabled;
  const approvalButton = document.querySelector('[data-toggle-target="teacherChallengesRequireApproval"]');
  if (approvalButton) approvalButton.disabled = !enabled;
  if (approvalRow) {
    approvalRow.classList.toggle("disabled-row", !enabled);
  }
}

function updateGlobalToggleUI() {
  const isGlobal = leaderboardGlobalRadio?.checked;
  if (!scopeToggleButton) return;
  scopeToggleButton.classList.toggle("enabled", Boolean(isGlobal));
  scopeToggleButton.classList.toggle("disabled", !isGlobal);
  scopeToggleButton.textContent = isGlobal ? "Allow Global View" : "Studio Only";
  scopeToggleButton.setAttribute("aria-pressed", String(Boolean(isGlobal)));
}

function updateToggleButtonVisual(id) {
  const checkbox = document.getElementById(id);
  const button = document.querySelector(`[data-toggle-target="${id}"]`);
  if (!checkbox || !button) return;
  const enabled = Boolean(checkbox.checked);
  button.classList.toggle("enabled", enabled);
  button.classList.toggle("disabled", !enabled);
  button.textContent = enabled ? "Enabled" : "Disabled";
  button.setAttribute("aria-pressed", String(enabled));
}

function updateAllToggleButtons() {
  TOGGLE_IDS.forEach(updateToggleButtonVisual);
}

function setupToggleButtons() {
  TOGGLE_IDS.forEach(id => {
    const checkbox = document.getElementById(id);
    const button = document.querySelector(`[data-toggle-target="${id}"]`);
    if (!checkbox || !button) return;
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      if (ADMIN_PERMISSION_FIELDS[id]) {
        if (!activeStudioId || !isStudioOwner) return;
        const nextValue = !checkbox.checked;
        const previousValue = checkbox.checked;
        checkbox.checked = nextValue;
        updateToggleButtonVisual(id);
        setStatus("Saving admin permissions...");
        setAdminPermissionsBusy(true);
        const { error } = await supabase
          .from("studio_permissions")
          .update({ [ADMIN_PERMISSION_FIELDS[id]]: nextValue })
          .eq("studio_id", activeStudioId);
        if (error) {
          checkbox.checked = previousValue;
          updateToggleButtonVisual(id);
          setStatus(error.message || "Failed to save admin permissions.", { isError: true });
        } else {
          setStatus("Admin permissions saved.");
        }
        setAdminPermissionsBusy(false);
        return;
      }
      const nextValue = !checkbox.checked;
      checkbox.checked = nextValue;
      updateToggleButtonVisual(id);
      const path = STUDIO_SETTINGS_TOGGLE_PATHS[id];
      if (path) {
        const nextSettings = setSettingsValue(currentStudioSettings, path, nextValue);
        const changedKey = path.join(".");
        await saveStudioSettings(nextSettings, { changedKey, nextValue });
      }
      if (id === "teacherCanCreateChallenges") {
        updateChallengeUI();
      }
    });
  });
}

function setupScopeToggle() {
  scopeToggleButton = document.querySelector("[data-scope-toggle]");
  leaderboardStudioRadio = document.getElementById("leaderboardStudioOnly");
  leaderboardGlobalRadio = document.getElementById("leaderboardGlobal");
  scopeToggleButton?.addEventListener("click", async () => {
    const currentlyGlobal = Boolean(leaderboardGlobalRadio?.checked);
    const nextScope = currentlyGlobal ? "studio_only" : "global";
    if (currentlyGlobal) {
      leaderboardStudioRadio && (leaderboardStudioRadio.checked = true);
    } else {
      leaderboardGlobalRadio && (leaderboardGlobalRadio.checked = true);
    }
    updateGlobalToggleUI();
    const nextSettings = setSettingsValue(currentStudioSettings, ["leaderboard", "scope"], nextScope);
    await saveStudioSettings(nextSettings, {
      changedKey: "leaderboard.scope",
      nextValue: nextScope
    });
  });
}

function setupHintToggles() {
  document.querySelectorAll(".hint-toggle").forEach(btn => {
    const targetId = btn.dataset.hintTarget;
    const hint = targetId && document.getElementById(targetId);
    if (!hint) return;
    btn.addEventListener("click", () => {
      const visible = !hint.hasAttribute("hidden");
      if (visible) {
        hint.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
      } else {
        hint.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
}

function refreshStudioFormInteractions() {
  updateAllToggleButtons();
  updateChallengeUI();
  updateGlobalToggleUI();
}

function updateCustomStudentLogSettings({ setUnsavedStatus = true } = {}) {
  const nextSettings = setSettingsValue(currentStudioSettings, ["studentLogTypes", "custom"], customStudentLogTypeRows);
  currentStudioSettings = nextSettings;
  if (setUnsavedStatus) setStatus("Unsaved student log type changes.");
}

function renderCustomStudentLogTypeToggleRows() {
  const mount = document.getElementById("studentCustomLogTypeToggleRows");
  if (!mount) return;
  mount.innerHTML = "";
  customStudentLogTypeRows.forEach((type) => {
    const row = document.createElement("div");
    row.className = "settings-row student-custom-type-row";
    row.innerHTML = `
      <div class="row-label">
        <label>${type.label}</label>
        <div class="student-custom-type-meta">${type.points} pts • ${type.category}</div>
      </div>
      <div class="row-value toggle-row-value">
        <button type="button" class="toggle-button ${type.enabled ? "enabled" : "disabled"}" data-custom-toggle-id="${type.id}" aria-pressed="${type.enabled ? "true" : "false"}">${type.enabled ? "Enabled" : "Disabled"}</button>
      </div>
      <div class="row-value">
        <button type="button" class="link-action" data-custom-remove-id="${type.id}">Remove</button>
      </div>
    `;
    mount.appendChild(row);
  });

  mount.querySelectorAll("[data-custom-toggle-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.customToggleId;
      const target = customStudentLogTypeRows.find((row) => row.id === id);
      if (!target) return;
      target.enabled = !target.enabled;
      renderCustomStudentLogTypeToggleRows();
      updateCustomStudentLogSettings();
      await saveStudioSettings(currentStudioSettings, {
        changedKey: "studentLogTypes.custom.toggle",
        nextValue: { id, enabled: target.enabled }
      });
    });
  });

  mount.querySelectorAll("[data-custom-remove-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.customRemoveId;
      customStudentLogTypeRows = customStudentLogTypeRows.filter((row) => row.id !== id);
      renderCustomStudentLogTypeToggleRows();
      updateCustomStudentLogSettings();
      await saveStudioSettings(currentStudioSettings, {
        changedKey: "studentLogTypes.custom.remove",
        nextValue: { id }
      });
    });
  });
}

function setupCustomStudentLogTypeForm() {
  const nameInput = document.getElementById("studentCustomLogTypeName");
  const pointsInput = document.getElementById("studentCustomLogTypePoints");
  const categoryInput = document.getElementById("studentCustomLogTypeCategory");
  const submitBtn = document.getElementById("studentCustomLogTypeSubmit");
  const status = document.getElementById("studentCustomLogTypeFormStatus");
  if (!nameInput || !pointsInput || !categoryInput || !submitBtn) return;

  submitBtn.addEventListener("click", async () => {
    const label = String(nameInput.value || "").trim();
    const category = String(categoryInput.value || "").trim().toLowerCase();
    const points = Number(pointsInput.value);
    if (!label || !category || !Number.isFinite(points) || points <= 0) {
      if (status) status.textContent = "Enter name, default points, and category before submitting.";
      return;
    }
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    customStudentLogTypeRows.push({
      id,
      label,
      category,
      points: Math.round(points),
      enabled: true
    });
    renderCustomStudentLogTypeToggleRows();
    updateCustomStudentLogSettings();
    await saveStudioSettings(currentStudioSettings, {
      changedKey: "studentLogTypes.custom.add",
      nextValue: { id, label, category, points: Math.round(points) }
    });
    nameInput.value = "";
    pointsInput.value = "";
    categoryInput.value = "";
    if (status) status.textContent = "Custom log type added.";
    nameInput.focus();
  });
}

function applyStudentLogTypeSettings(settings = {}) {
  const studentLogTypes = settings.studentLogTypes || {};
  const presets = { ...getDefaultStudentLogTypePresets(), ...(studentLogTypes.presets || {}) };
  STUDENT_LOG_TYPE_PRESETS.forEach(({ key, inputId }) => {
    safeCheck(inputId, Boolean(presets[key]));
  });
  customStudentLogTypeRows = normalizeCustomStudentLogTypes(studentLogTypes.custom || []);
  renderCustomStudentLogTypeToggleRows();
}

function setupStudioFormInteractions() {
  createChallengesCheckbox = document.getElementById("teacherCanCreateChallenges");
  approvalCheckbox = document.getElementById("teacherChallengesRequireApproval");
  approvalRow = document.getElementById("challengeApprovalRow");
  setupToggleButtons();
  setupScopeToggle();
  setupHintToggles();
  setupCustomStudentLogTypeForm();
  renderCustomStudentLogTypeToggleRows();
  refreshStudioFormInteractions();
}

function handleSettings(settings = {}) {
  const permissions = settings.permissions || {};
  const challenges = settings.challenges || {};
  const leaderboard = settings.leaderboard || {};
  const notifications = settings.notifications || {};
  const badges = settings.badges || {};

  safeCheck("teacherCanLogPoints", permissions.teacherCanLogPoints);
  safeCheck("teacherCanCreateChallenges", permissions.teacherCanCreateChallenges);
  safeCheck("teacherCanApproveLogs", permissions.teacherCanApproveLogs);

  safeCheck("teacherChallengesRequireApproval", challenges.teacherChallengesRequireApproval);

  const scope = leaderboard.scope === "global" ? "global" : "studio_only";
  if (scope === "global") {
    safeCheck("leaderboardGlobal", true);
    safeCheck("leaderboardStudioOnly", false);
  } else {
    safeCheck("leaderboardStudioOnly", true);
    safeCheck("leaderboardGlobal", false);
  }

  safeCheck("adminOnLogSubmitted", notifications.adminOnLogSubmitted);
  safeCheck("adminOnLogFlagged", notifications.adminOnLogFlagged);
  safeCheck("adminOnLevelUp", notifications.adminOnLevelUp);

  safeCheck("badgesEnabled", badges.enabled);
  applyStudentLogTypeSettings(settings);
  refreshStudioFormInteractions();
}

function normalizeStudioSettings(settings = {}) {
  const next = settings && typeof settings === "object" ? { ...settings } : {};
  next.permissions = { ...(next.permissions || {}) };
  next.challenges = { ...(next.challenges || {}) };
  next.leaderboard = { ...(next.leaderboard || {}) };
  next.notifications = { ...(next.notifications || {}) };
  next.badges = { ...(next.badges || {}) };
  const defaultPresets = getDefaultStudentLogTypePresets();
  const sourceStudentLogTypes = next.studentLogTypes && typeof next.studentLogTypes === "object"
    ? next.studentLogTypes
    : {};
  next.studentLogTypes = {
    presets: { ...defaultPresets, ...(sourceStudentLogTypes.presets || {}) },
    custom: normalizeCustomStudentLogTypes(sourceStudentLogTypes.custom || [])
  };
  return next;
}

function setSettingsValue(baseSettings, path, value) {
  const next = normalizeStudioSettings(baseSettings);
  let cursor = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const segment = cursor[key];
    cursor[key] = segment && typeof segment === "object" ? { ...segment } : {};
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

async function saveStudioSettings(nextSettings, { changedKey = "", nextValue } = {}) {
  if (!activeStudioId) {
    setStatus("Missing active studio.", { isError: true });
    return false;
  }
  const payload = normalizeStudioSettings(nextSettings);
  console.log("[Studio Settings] saving", activeStudioId, changedKey, nextValue);
  const { data, error } = await supabase.rpc("update_my_studio_settings", {
    p_name: null,
    p_email: null,
    p_logo_url: null,
    p_settings: payload
  });
  if (error) {
    console.error("[Studio Settings] save failed", error, JSON.stringify(error, null, 2));
    setStatus(error.message || "Failed to save settings.", { isError: true });
    showToast("Save failed");
    return false;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const rawSettings = row?.settings;
  let parsed = payload;
  if (typeof rawSettings === "string") {
    try {
      parsed = normalizeStudioSettings(JSON.parse(rawSettings || "{}"));
    } catch {
      parsed = payload;
    }
  } else if (rawSettings && typeof rawSettings === "object") {
    parsed = normalizeStudioSettings(rawSettings);
  }
  currentStudioSettings = parsed;
  handleSettings(currentStudioSettings);
  setStatus("Saved");
  showToast("Saved");
  console.log("[Studio Settings] saved");
  return true;
}

const DEFAULT_STUDIO_PREVIEW = "images/logos/amplified.png";

function showPreview(url) {
  const preview = document.getElementById("studioLogoPreview");
  if (!preview) return;
  const nextSrc = url || DEFAULT_STUDIO_PREVIEW;
  preview.src = nextSrc;
  preview.style.display = "block";
}

async function loadStudioSettings() {
  setStatus("Loading studio settings...");
  try {
    const adminPermissions = await loadAdminPermissions(activeStudioId);
    applyAdminPermissionValues(adminPermissions);
    setAdminPermissionsReadonly(!isStudioOwner);

    const { data, error } = await supabase.rpc("get_my_studio");
    if (error) {
      console.error("[Studio Settings] load failed", error);
      setStatus(error.message || "Failed to load studio settings.", { isError: true });
      return;
    }

    const studio = Array.isArray(data) ? data[0] : data;
    console.log("[Studio Settings] loaded studio", studio);
    if (!studio) {
      setStatus("No studio data returned.", { isError: true });
      return;
    }

    safeSetValue("studioName", studio.name);
    safeSetValue("studioEmail", studio.email);
    showPreview(studio.logo_url);
    const rawSettings = studio.settings;
    let parsedSettings =
      typeof rawSettings === "string" ? rawSettings : rawSettings || {};
    if (typeof rawSettings === "string") {
      try {
        parsedSettings = JSON.parse(rawSettings || "{}");
      } catch (parseErr) {
        console.warn("[Studio Settings] failed to parse settings JSON", parseErr);
        parsedSettings = {};
      }
    }
    currentStudioSettings = normalizeStudioSettings(parsedSettings);
    handleSettings(currentStudioSettings);
    setStatus("");
  } catch (err) {
    console.error("[Studio Settings] unexpected error", err);
    setStatus("Unexpected error loading studio settings.", { isError: true });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  (async () => {
    const authUserId = await getAuthUserId();
    if (!authUserId) {
      window.location.replace("login.html");
      return;
    }

    activeStudioId = await getActiveStudioIdForUser(authUserId);
    if (!activeStudioId) {
      setStatus("Studio not found.", { isError: true });
      return;
    }
    isStudioOwner = await isAccountHolder(activeStudioId);

    const hasStudioSettingsControls = Boolean(document.querySelector('[data-toggle-target="teacherCanLogPoints"]'));
    if (!hasStudioSettingsControls) {
      return;
    }

    setupStudioFormInteractions();
    const saveBtn = document.getElementById("saveStudioSettingsBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        await saveStudioSettings(currentStudioSettings, {
          changedKey: "manual_save",
          nextValue: null
        });
      });
    }
    loadStudioSettings();
  })();
});
