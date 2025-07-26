import { supabase } from './supabase.js';
import { levels } from './levels.js'; // Make sure you have a levels.js file with level definitions

// Calculate level based on total points
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

// Render category summaries
function renderCategorySummary(logs) {
  const categories = {};
  logs.forEach(log => {
    const cat = log.category;
    if (!categories[cat]) categories[cat] = { points: 0, count: 0 };
    categories[cat].points += log.points;
    categories[cat].count++;
  });

  const summaryContainer = document.getElementById('categorySummary');
  summaryContainer.innerHTML = '';
  for (const [cat, data] of Object.entries(categories)) {
    const div = document.createElement('div');
    div.classList.add('category-card');
    div.innerHTML = `<h3>${cat}</h3><p>${data.points} pts</p><p>${data.count} logs</p>`;
    summaryContainer.appendChild(div);
  }
}

// Render log table
function renderLogsTable(logs) {
  const tableBody = document.getElementById('logsTableBody');
  tableBody.innerHTML = '';
  logs.forEach(log => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(log.date).toLocaleDateString()}</td>
      <td>${log.category}</td>
      <td>${log.points}</td>
      <td>${log.note || ''}</td>
    `;
    tableBody.appendChild(row);
  });
}

// Fetch logs for the logged-in user and update UI
async function loadUserLogs(user) {
  const { data: logs, error } = await supabase
    .from('logs')
    .select('*')
    .eq('userId', user.id)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching logs:', error);
    return [];
  }

  renderLogsTable(logs);
  renderCategorySummary(logs);
  return logs;
}

// Update user's points and level in Supabase
async function updateUserPointsAndLevel(user, totalPoints) {
  const levelData = calculateLevel(totalPoints);
  await supabase.from('users').update({ points: totalPoints, level: levelData.number }).eq('id', user.id);

  // Update localStorage so home.js can use the latest values
  user.points = totalPoints;
  user.level = levelData.number;
  localStorage.setItem('loggedInUser', JSON.stringify(user));
}

// Initialize My Points page
async function initMyPoints() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  if (!user) {
    alert('You must be logged in.');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('homeBtn').addEventListener('click', () => window.location.href = 'index.html');

  const logs = await loadUserLogs(user);
  const totalPoints = logs.reduce((sum, log) => sum + log.points, 0);

  document.getElementById('totalPoints').textContent = `${totalPoints} Points`;
  await updateUserPointsAndLevel(user, totalPoints);
}

document.addEventListener('DOMContentLoaded', initMyPoints);
