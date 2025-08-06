import { supabase } from './supabase.js';

export async function recalculateUserPoints(userId) {
  try {
    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('*')
      .eq('userId', userId)
      .eq('status', 'approved');
    if (logsError) throw logsError;

    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);

    const { data: levels, error: levelsError } = await supabase
      .from('levels')
      .select('*')
      .order('minPoints', { ascending: true });
    if (levelsError) throw levelsError;

    let currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) || levels[levels.length - 1];

    await supabase.from('users').update({ points: totalPoints, level: currentLevel.id }).eq('id', userId);
    console.log(`[DEBUG] Recalculated points for user ${userId}: ${totalPoints} pts, Level ${currentLevel.id}`);
    return { totalPoints, currentLevel };
  } catch (err) {
    console.error('[ERROR] Recalculate failed:', err);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const storedUser = JSON.parse(localStorage.getItem('loggedInUser'));
  const activeRole = localStorage.getItem('activeRole');

  if (!storedUser || !activeRole) {
    alert('You must be logged in.');
    window.location.href = 'login.html';
    return;
  }

  if (activeRole.toLowerCase() === 'parent' && !sessionStorage.getItem('parentModalShown')) {
    sessionStorage.setItem('parentModalShown', 'true');
    sessionStorage.setItem('forceUserSwitch', 'true');
    window.location.href = 'settings.html';
    return;
  }

  await recalculateUserPoints(storedUser.id);

  try {
    const { data: logs } = await supabase.from('logs').select('*').eq('userId', storedUser.id);
    const approvedLogs = logs.filter(l => l.status === 'approved');
    const totalPoints = approvedLogs.reduce((sum, log) => sum + (log.points || 0), 0);

    const { data: levels } = await supabase.from('levels').select('*').order('minPoints', { ascending: true });
    let currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) || levels[levels.length - 1];
    const nextLevel = levels[levels.findIndex(l => l.id === currentLevel.id) + 1];

    const { data: freshUser } = await supabase.from('users').select('id, firstName, lastName, avatarUrl, roles').eq('id', storedUser.id).single();

    const userData = {
      ...freshUser,
      lastName: freshUser?.lastName || storedUser.lastName || '',
      roles: freshUser?.roles || storedUser.roles || [],
      points: totalPoints,
      level: currentLevel?.id || 1,
      badge: currentLevel?.badge || `images/levelBadges/level${currentLevel?.id || 1}.png`,
      levelColor: currentLevel?.color || '#3eb7f8'
    };

    localStorage.setItem('loggedInUser', JSON.stringify(userData));
    updateHomeUI(userData, activeRole, currentLevel, nextLevel);
  } catch (err) {
    console.error('[ERROR] Could not refresh home page info:', err);
    updateHomeUI(storedUser, activeRole, null, null);
  }
});

function updateHomeUI(userData, activeRole, currentLevel, nextLevel) {
  const welcome = document.getElementById('welcomeTitle');
  if (welcome) {
    welcome.textContent = `Welcome, ${userData.firstName}!`;
    welcome.style.color = '#00477d';
    welcome.style.fontSize = '2rem';
    welcome.style.fontWeight = 'bold';
  }

  const avatar = document.getElementById('homeAvatar');
  if (avatar) avatar.src = userData.avatarUrl || 'images/logos/default.png';

  const badgeImg = document.getElementById('homeBadge');
  if (badgeImg) badgeImg.src = (activeRole === 'student') ? userData.badge : `images/levelBadges/${activeRole}.png`;

  const progressBar = document.getElementById('homeProgressBar');
  const progressLabel = document.getElementById('homeProgressLabel');
  if (progressBar && progressLabel && currentLevel) {
    const percent = nextLevel ? ((userData.points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100 : 100;
    progressBar.style.width = Math.min(100, Math.max(0, percent)) + '%';
    progressBar.style.backgroundColor = userData.levelColor;
    progressLabel.textContent = `${Math.round(percent)}% complete`;
  }

  document.getElementById('pointsOverlay').textContent = `${userData.points} pts`;

  const myPointsBtn = document.getElementById('myPointsBtn');
  const reviewLogsBtn = document.getElementById('reviewLogsBtn');
  const manageUsersBtn = document.getElementById('manageUsersBtn');
  const levelSection = document.getElementById('levelSection');
  const middleCol = document.getElementById('middleButtonCol');
  const topRow = middleCol?.parentElement;

  myPointsBtn.classList.add('invisible');
  reviewLogsBtn.classList.add('invisible');
  myPointsBtn.style.display = 'none';
  reviewLogsBtn.style.display = 'none';
  middleCol.style.display = 'none';
  topRow.classList.remove('flex-center');

  if (activeRole === 'admin' || activeRole === 'teacher') {
    reviewLogsBtn.classList.remove('invisible');
    reviewLogsBtn.style.display = 'flex';
    middleCol.style.display = 'flex';
    topRow.classList.add('flex-center');
    if (activeRole === 'admin') manageUsersBtn.style.display = 'inline-block';
  } else {
    myPointsBtn.classList.remove('invisible');
    myPointsBtn.style.display = 'flex';
    middleCol.style.display = 'flex';
    levelSection.style.display = 'block';
    topRow.classList.add('flex-center');
  }
}
