import { supabase } from './supabase.js';
import { levels } from './levels.js';

function calculateLevel(points) {
  let currentLevel = levels[0];
  for (const lvl of levels) {
    if (points >= lvl.min) {
      currentLevel = lvl;
    } else {
      break;
    }
  }
  return currentLevel;
}

async function loadUserData() {
  let user = JSON.parse(localStorage.getItem('loggedInUser'));
  if (!user) {
    alert('You must be logged in.');
    window.location.href = 'index.html';
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!error && data) {
    user = data;
    localStorage.setItem('loggedInUser', JSON.stringify(user));
  }
  return user;
}

function updateHomeUI(user) {
  const welcomeTitle = document.getElementById('welcomeTitle');
  if (welcomeTitle) {
    welcomeTitle.textContent = `Welcome ${user.firstName}`;
  }

  const bitmoji = document.getElementById('homeBitmoji');
  if (bitmoji) {
    bitmoji.src = user.avatarUrl || 'images/logos/default.png';
  }

  const badge = document.getElementById('homeBadge');
  if (badge) {
    if (Array.isArray(user.roles)) {
      if (user.roles.includes('admin')) {
        badge.src = 'images/levelBadges/admin.png';
      } else if (user.roles.includes('teacher')) {
        badge.src = 'images/levelBadges/teacher.png';
      } else {
        const level = calculateLevel(user.points || 0);
        badge.src = `images/levelBadges/level${level.number}.png`;
      }
    }
  }

  const level = calculateLevel(user.points || 0);
  const percent = Math.min(100, Math.round(((user.points - level.min) / (level.max - level.min)) * 100));
  const progressBar = document.getElementById('homeProgressBar');
  if (progressBar) progressBar.style.width = `${percent}%`;
  const progressText = document.getElementById('homeProgressText');
  if (progressText) progressText.textContent = `${percent}% to next level`;
}

async function initHome() {
  const user = await loadUserData();
  if (!user) return;
  updateHomeUI(user);
}

document.addEventListener('DOMContentLoaded', initHome);
