import { supabase } from './supabase.js';

// Inline level definitions (replaces missing levels.js)
const levels = [
  { number: 1, min: 0, max: 100 },
  { number: 2, min: 101, max: 300 },
  { number: 3, min: 301, max: 600 },
  { number: 4, min: 601, max: 1000 }
];

function calculateLevel(points) {
  let currentLevel = levels[0];
  for (const lvl of levels) {
    if (points >= lvl.min) currentLevel = lvl; else break;
  }
  return currentLevel;
}

function renderCategorySummary(logs) {
  const container = document.getElementById('categorySummary');
  container.innerHTML = '';
  const categories = {};
  logs.forEach(log => {
    if (!categories[log.category]) categories[log.category] = { points: 0, count: 0 };
    categories[log.category].points += log.points;
    categories[log.category].count++;
  });
  for (const [cat, data] of Object.entries(categories)) {
    const div = document.createElement('div');
    div.className = 'category-card';
    div.innerHTML = `<h3>${cat}</h3><p>${data.points} pts</p><p>${data.count} logs</p>`;
    container.appendChild(div);
  }
}

function renderLogsTable(logs) {
  const body = document.getElementById('logsTableBody');
  body.innerHTML = '';
  logs.forEach(log => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${new Date(log.date).toLocaleDateString()}</td><td>${log.category}</td><td>${log.points}</td><td>${log.note || ''}</td>`;
    body.appendChild(row);
  });
}

async function loadUserLogs(user) {
  const { data: logs, error } = await supabase.from('logs').select('*').eq('userId', user.id).order('date', { ascending: false });
  console.log('[DEBUG] Fetched logs:', logs, error);
  if (error) return [];
  renderLogsTable(logs);
  renderCategorySummary(logs);
  return logs;
}

async function updateUserPoints(user, totalPoints) {
  const level = calculateLevel(totalPoints);
  const { error } = await supabase.from('users').update({ points: totalPoints, level: level.number }).eq('id', user.id);
  if (error) console.error('Error updating user points:', error);
  user.points = totalPoints;
  user.level = level.number;
  localStorage.setItem('loggedInUser', JSON.stringify(user));
}

async function initMyPoints() {
  let user = JSON.parse(localStorage.getItem('loggedInUser'));
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  document.getElementById('homeBtn').addEventListener('click', () => window.location.href = 'index.html');

  const logs = await loadUserLogs(user);
  if (!logs.length) {
    document.getElementById('totalPoints').textContent = '0 Points';
    return;
  }

  const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);
  document.getElementById('totalPoints').textContent = `${totalPoints} Points`;
  await updateUserPoints(user, totalPoints);
}

document.addEventListener('DOMContentLoaded', initMyPoints);
