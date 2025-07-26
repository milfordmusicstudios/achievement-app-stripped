import { supabase } from './supabase.js';
import { levels } from './levels.js';

function calculateLevel(points) {
  let currentLevel = levels[0];
  for (const lvl of levels) {
    if (points >= lvl.min) {
      currentLevel = lvl;
    } else break;
  }
  return currentLevel;
}

function renderCategorySummary(logs) {
  const categories = {};
  logs.forEach(log => {
    if (!categories[log.category]) categories[log.category] = { points: 0, count: 0 };
    categories[log.category].points += log.points;
    categories[log.category].count++;
  });
  const container = document.getElementById('categorySummary');
  container.innerHTML = '';
  for (const [cat, data] of Object.entries(categories)) {
    const div = document.createElement('div');
    div.classList.add('category-card');
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
  const { data: logs, error } = await supabase
    .from('logs')
    .select('*')
    .eq('userId', user.id)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
  console.log('Fetched logs:', logs);
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
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  if (!user) {
    alert('You must be logged in.');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('homeBtn').addEventListener('click', () => window.location.href = 'index.html');

  const logs = await loadUserLogs(user);
  if (!logs || logs.length === 0) {
    document.getElementById('totalPoints').textContent = '0 Points';
    return;
  }

  const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);
  document.getElementById('totalPoints').textContent = `${totalPoints} Points`;
  await updateUserPoints(user, totalPoints);
}

document.addEventListener('DOMContentLoaded', initMyPoints);
