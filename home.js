import { supabase } from './supabaseClient.js';

const qs = id => document.getElementById(id);


async function loadLevel(levelId) {
  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("id", levelId)
    .single();

  if (error) {
    console.error("Failed to load level", error);
    return null;
  }
  return data;
}

function renderIdentity(profile, level) {
qs('welcomeText').textContent = `Welcome, ${profile.firstName || 'Student'}!`;
const avatarImg = document.getElementById("avatarImg");
const url = profile?.avatarUrl;

if (avatarImg) {
  avatarImg.src = (typeof url === "string" && url.trim())
    ? url
    : "images/icons/default.png";
}
qs('levelBadgeImg').src = level.badge;

  const pct = Math.min(
    100,
    Math.round(
((profile.points - level.minPoints) /
  (level.maxPoints - level.minPoints)) *
  100
    )
  );

  qs('progressFill').style.width = `${pct}%`;
  qs('progressText').textContent = `${profile.points} XP`;
  qs('progressPercent').textContent = `${pct}% complete`;
}

async function init() {
  // 🔒 Hard auth gate
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    window.location.href = "login.html";
    return;
  }

  // 🔁 Active student must already be selected
  const raw = localStorage.getItem("loggedInUser");
  if (!raw) {
    // Logged in parent, but no student selected yet
    window.location.href = "settings.html";
    return;
  }

const profile = JSON.parse(raw);
const levelRow = await loadLevel(profile.level || 1);
renderIdentity(profile, levelRow);
}

document.addEventListener('DOMContentLoaded', init);
