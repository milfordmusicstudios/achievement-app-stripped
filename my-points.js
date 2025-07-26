import { supabase } from './supabase.js';

// Inline levels
const levels = [
  { number: 1, min: 0, max: 100 },
  { number: 2, min: 101, max: 300 },
  { number: 3, min: 301, max: 600 },
  { number: 4, min: 601, max: 1000 }
];

// Category icons mapping
const categoryIcons = {
  "Practice": "images/categories/practice.png",
  "Performance": "images/categories/performance.png",
  "Workshop": "images/categories/workshop.png",
  "Challenge": "images/categories/challenge.png"
};

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
    const icon = categoryIcons[cat] || 'images/categories/default.png';
    div.innerHTML = `<img src="${icon}" alt="${cat}"><h3>${data.points} pts</h3><p>${data.count} logs</p>`;
    container.appendChild(div);
  }
}

function renderLogsTable(logs) {
  const body = document.getElementById('logsTableBody');
  body.innerHTML = '';
  logs.forEach(log => {
    const row = document.createElement('tr');
    const icon = categoryIcons[log.category] || 'images/categories/default.png';
    row.innerHTML = `
      <td><img src="${icon}" alt="${log.category}" style="width:30px;height:30px;"></td>
      <td>${new Date(log.date).toLocaleDateString()}</td>
      <td>${log.points}</td>
      <td>${log.note || ''}</td>`;
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
  await supabase.from('users').update({ points: totalPoints, level: level.number }).eq('id', user.id);
  user.points = totalPoints;
  user.level = level.number;
  localStorage.setItem('loggedInUser', JSON.stringify(user));
}

async function initMyPoints() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
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
