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
  document.getElementById('welcomeTitle').textContent = `Welcome ${user.firstName}`;
  document.getElementById('homeBitmoji').src = user.avatarUrl || 'images/logos/default.png';

  const level = calculateLevel(user.points);
  const percent = Math.min(100, Math.round(((user.points - level.min) / (level.max - level.min)) * 100));

  document.getElementById('homeProgressBar').style.width = `${percent}%`;
  document.getElementById('homeProgressText').textContent = `${percent}% to next level`;
  document.getElementById('homeBadge').src = `images/levelBadges/level${level.number}.png`;
}

async function initHome() {
  const user = await loadUserData();
  if (!user) return;
  updateHomeUI(user);
}

document.addEventListener('DOMContentLoaded', initHome);
