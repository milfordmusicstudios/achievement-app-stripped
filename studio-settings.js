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
}

function showPreview(url) {
  const preview = document.getElementById("studioLogoPreview");
  if (!preview) return;
  if (url) {
    preview.src = url;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
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

document.addEventListener("DOMContentLoaded", loadStudioSettings);
