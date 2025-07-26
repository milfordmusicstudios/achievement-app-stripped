import { supabase } from './supabase.js';

// Inline level definitions
const levels = [
  { number: 1, min: 0, max: 100 },
  { number: 2, min: 101, max: 300 },
  { number: 3, min: 301, max: 600 },
  { number: 4, min: 601, max: 1000 }
];

function calculateLevel(points) {
  let current = levels[0];
  for (const lvl of levels) {
    if (points >= lvl.min) current = lvl; else break;
  }
  return current;
}

async function loadUserData() {
  let user = JSON.parse(localStorage.getItem('loggedInUser'));
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).single();
    console.log('[DEBUG] Home Supabase user fetch:', data, error);
    if (!error && data) {
      user = data;
      localStorage.setItem('loggedInUser', JSON.stringify(user));
    }
    return user;
  } catch (err) {
    console.error('[DEBUG] Home Supabase fetch failed:', err);
    return user;
  }
}

function updateHomeUI(user) {
  const welcome = document.getElementById('welcomeTitle');
  if (welcome) welcome.textContent = `Welcome ${user.firstName}`;

  const bitmoji = document.getElementById('homeBitmoji');
  if (bitmoji) bitmoji.src = user.avatarUrl || 'images/logos/default.png';

  const badge = document.getElementById('homeBadge');
  if (badge) {
    if (Array.isArray(user.roles)) {
      if (user.roles.includes('admin')) badge.src = 'images/levelBadges/admin.png';
      else if (user.roles.includes('teacher')) badge.src = 'images/levelBadges/teacher.png';
      else badge.src = `images/levelBadges/level${calculateLevel(user.points || 0).number}.png`;
    }
  }

  const level = calculateLevel(user.points || 0);
  const percent = Math.min(100, Math.round(((user.points - level.min) / (level.max - level.min)) * 100));
  const bar = document.getElementById('homeProgressBar');
  if (bar) bar.style.width = `${percent}%`;
  const progressText = document.getElementById('homeProgressText');
  if (progressText) progressText.textContent = `${percent}% to next level`;
}

async function initHome() {
  const user = await loadUserData();
  if (!user) return;
  updateHomeUI(user);
}

document.addEventListener('DOMContentLoaded', initHome);
