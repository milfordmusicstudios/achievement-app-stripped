import { supabase } from './supabaseClient.js';

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
  "teacherCanLogPoints",
  "teacherCanApproveLogs",
  "teacherCanCreateChallenges",
  "teacherChallengesRequireApproval",
  "adminOnLogSubmitted",
  "adminOnLogFlagged",
  "adminOnLevelUp",
  "badgesEnabled"
];

let createChallengesCheckbox;
let approvalCheckbox;
let approvalRow;
let leaderboardStudioRadio;
let leaderboardGlobalRadio;
let scopeToggleButton;

function updateChallengeUI() {
  const enabled = createChallengesCheckbox?.checked;
  if (approvalCheckbox) approvalCheckbox.disabled = !enabled;
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
    button.addEventListener("click", () => {
      checkbox.checked = !checkbox.checked;
      updateToggleButtonVisual(id);
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
  scopeToggleButton?.addEventListener("click", () => {
    const currentlyGlobal = Boolean(leaderboardGlobalRadio?.checked);
    if (currentlyGlobal) {
      leaderboardStudioRadio && (leaderboardStudioRadio.checked = true);
    } else {
      leaderboardGlobalRadio && (leaderboardGlobalRadio.checked = true);
    }
    updateGlobalToggleUI();
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

function setupStudioFormInteractions() {
  createChallengesCheckbox = document.getElementById("teacherCanCreateChallenges");
  approvalCheckbox = document.getElementById("teacherChallengesRequireApproval");
  approvalRow = document.getElementById("challengeApprovalRow");
  setupToggleButtons();
  setupScopeToggle();
  setupHintToggles();
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
  refreshStudioFormInteractions();
}

const DEFAULT_STUDIO_PREVIEW = "images/logos/logo.png";

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
    handleSettings(parsedSettings);
    setStatus("");
  } catch (err) {
    console.error("[Studio Settings] unexpected error", err);
    setStatus("Unexpected error loading studio settings.", { isError: true });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupStudioFormInteractions();
  loadStudioSettings();
});
