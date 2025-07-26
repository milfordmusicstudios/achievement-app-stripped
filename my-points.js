import { supabase } from './supabase.js';

// Inline levels
const levels = [
  { number: 1, min: 0, max: 100 },
  { number: 2, min: 101, max: 300 },
  { number: 3, min: 301, max: 600 },
  { number: 4, min: 601, max: 1000 }
];

// Fixed category icons
const categoryIcons = {
  "Performance": "images/categories/performance.png",
  "Participation": "images/categories/participation.png",
  "Practice": "images/categories/practice.png",
  "Personal": "images/categories/personal.png",
  "Proficiency": "images/categories/proficiency.png",
  "Total": "images/categories/allCategories.png"
};

// Predefined categories
const categoryList = ["Performance", "Participation", "Practice", "Personal", "Proficiency"];

function calculateLevel(points) {
  let currentLevel = levels[0];
  for (const lvl of levels) {
    if (points >= lvl.min) currentLevel = lvl; else break;
  }
  return currentLevel;
}

// Render category summary with fixed 6 cards
function renderCategorySummary(logs) {
  const container = document.getElementById('categorySummary');
  container.innerHTML = '';

  const categories = {};
  let totalPoints = 0, totalLogs = logs.length;

  logs.forEach(log => {
    totalPoints += log.points || 0;
    if (!categories[log.category]) categories[log.category] = { points: 0, count: 0 };
    categories[log.category].points += log.points;
    categories[log.category].count++;
  });

  // Render fixed category cards
  categoryList.forEach(cat => {
    const data = categories[cat] || { points: 0, count: 0 };
    const div = document.createElement('div');
    div.className = 'category-card';
    div.innerHTML = `
      <img src="${categoryIcons[cat]}" alt="${cat}">
      <h3>${data.points} pts</h3>
      <p>${data.count} logs</p>
    `;
    container.appendChild(div);
  });

  // Add Total Points card
  const totalDiv = document.createElement('div');
  totalDiv.className = 'category-card total-card';
  totalDiv.innerHTML = `
    <img src="${categoryIcons['Total']}" alt="Total Points">
    <h3>${totalPoints} pts</h3>
    <p>${totalLogs} logs</p>
  `;
  container.appendChild(totalDiv);
}

function renderLogsTable(logs) {
  const body = document.getElementById('logsTableBody');
  body.innerHTML = '';

  logs.forEach((log, index) => {
    const row = document.createElement('tr');
    row.className = index % 2 === 0 ? 'log-row-even' : 'log-row-odd';
    const icon = categoryIcons[log.category] || categoryIcons['Total'];
    row.innerHTML = `
      <td><img src="${icon}" alt="${log.category}" style="width:30px;height:30px;"></td>
      <td>${new Date(log.date).toLocaleDateString()}</td>
      <td>${log.points}</td>
      <td>${log.note || ''}</td>
    `;
    body.appendChild(row);
  });
}

async function loadUserLogs(user) {
  const { data: logs, error } = await supabase
    .from('logs')
    .select('*')
    .eq('userId', user.id)
    .order('date', { ascending: false });

  console.log('[DEBUG] Fetched logs:', logs, error);
  if (error) return [];

  renderLogsTable(logs);
  renderCategorySummary(logs);
  return logs;
}

async function updateUserPoints(user, totalPoints) {
  const level = calculateLevel(totalPoints);
  await supabase.from('users')
    .update({ points: totalPoints, level: level.number })
    .eq('id', user.id);

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
  const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);
  await updateUserPoints(user, totalPoints);
}

document.addEventListener('DOMContentLoaded', initMyPoints);
