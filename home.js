import { supabase } from './supabaseClient.js';
import { requireAuth } from './auth.js';

const qs = id => document.getElementById(id);

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Failed to load profile', error);
    return null;
  }
  return data;
}

async function loadLevel(level) {
  const { data, error } = await supabase
    .from('levels')
    .select('*')
.eq('id', 1)
    .single();

  if (error) {
    console.error('Failed to load level', error);
    return null;
  }
  return data;
}

function renderIdentity(profile, level) {
  qs('welcomeText').textContent = `Welcome, ${profile.first_name || 'Student'}!`;
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
      ((profile.points - level.min_points) /
        (level.max_points - level.min_points)) *
        100
    )
  );

  qs('progressFill').style.width = `${pct}%`;
  qs('progressText').textContent = `${profile.points} XP`;
  qs('progressPercent').textContent = `${pct}% complete`;
}

async function init() {
  // 🔒 Centralized auth gate
  const user = await requireAuth();
  if (!user) return;

  const profile = await loadProfile(user.id);
  if (!profile) return;

  const level = await loadLevel(profile.level || 1);
  if (!level) return;

  renderIdentity(profile, level);
}

document.addEventListener('DOMContentLoaded', init);
