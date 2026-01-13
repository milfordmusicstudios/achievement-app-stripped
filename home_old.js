import { supabase } from './supabaseClient.js';
// =========================
// LOCAL DEMO MODE (no Supabase required)
// Triggered when:
// - URL has ?demo=1 OR
// - running on localhost/127.0.0.1 OR
// - opened via file://
// Safe for production: does not trigger on hosted domains.
// =========================
const DEMO_MODE = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') return true;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (window.location.protocol === 'file:') return true;
  } catch (e) {}
  return false;
})();

function demoSeedSession() {
  // Create a consistent demo user + role if missing
  const existing = localStorage.getItem('loggedInUser');
  const existingRole = localStorage.getItem('activeRole');
  if (!existing) {
    const demoUser = {
      id: 'demo-student-1',
      firstName: 'Demo',
      lastName: 'Student',
      avatarUrl: './images/bitmojis/default.png',
      roles: ['student'],
    };
    localStorage.setItem('loggedInUser', JSON.stringify(demoUser));
  }
  if (!existingRole) localStorage.setItem('activeRole', 'student');
}

function demoGetUser() {
  try {
    const raw = localStorage.getItem('loggedInUser');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function demoGetLogs() {
  try {
    const raw = localStorage.getItem('demoLogs');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function demoSaveLogs(logs) {
  localStorage.setItem('demoLogs', JSON.stringify(logs));
}

function demoComputePointsForUser(userId) {
  const logs = demoGetLogs().filter(l => l.userId === userId && (l.status || 'approved') === 'approved');
  return logs.reduce((sum, l) => sum + (Number(l.points) || 0), 0);
}

function demoLevels() {
  // Simple progressive thresholds; replace later with your real 12-level table if desired
  return [
    { level: 1, min: 0,   max: 99 },
    { level: 2, min: 100, max: 249 },
    { level: 3, min: 250, max: 449 },
    { level: 4, min: 450, max: 699 },
    { level: 5, min: 700, max: 999 },
    { level: 6, min: 1000, max: 1349 },
    { level: 7, min: 1350, max: 1749 },
    { level: 8, min: 1750, max: 2199 },
    { level: 9, min: 2200, max: 2699 },
    { level: 10, min: 2700, max: 3299 },
    { level: 11, min: 3300, max: 3999 },
    { level: 12, min: 4000, max: 999999 },
  ];
}

function demoLevelFromPoints(points) {
  const lvls = demoLevels();
  const match = lvls.find(l => points >= l.min && points <= l.max) || lvls[0];
  return match.level;
}

/**
 * HOME (index.html)
 * Goals:
 * - Identity first (avatar, level badge, progress)
 * - One-tap practice log
 * - Shortcut chips that jump to Log Points with correct category pre-selected
 * - Friendly nudge after 7+ days away
 */

function qs(id) { return document.getElementById(id); }

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysBetween(a, b) {
  const ms = 1000 * 60 * 60 * 24;
  return Math.floor((b - a) / ms);
}

async function getCurrentUserProfile() {
  if (DEMO_MODE) {
    demoSeedSession();
    const u = demoGetUser();
    if (!u) return null;
    const points = demoComputePointsForUser(u.id);
    return {
      id: u.id,
      firstName: u.firstName || 'Demo',
      lastName: u.lastName || 'Student',
      avatarUrl: u.avatarUrl || '',
      points,
      level: demoLevelFromPoints(points),
      roles: u.roles || ['student'],
    };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, firstName, lastName, avatarUrl, points, level, roles')
    .eq('id', user.id)
    .single();

  return profile || null;
}

async function getLevelInfo(levelNum) {
  if (DEMO_MODE) {
    const lvls = demoLevels();
    const found = lvls.find(l => l.level === Number(levelNum)) || lvls[0];
    return {
      id: `demo-level-${found.level}`,
      name: `Level ${found.level}`,
      color: '#00477d',
      badge: './images/badges/level1.png',
      minPoints: found.min,
      maxPoints: found.max,
    };
  }

  const { data } = await supabase
    .from('levels')
    .select('id, name, color, badge, minPoints, maxPoints')
    .eq('level', levelNum)
    .single();

  return data || null;
}

function setIdentity(profile, levelInfo) {
  const welcomeText = qs('welcomeText');
  const avatarImg = qs('avatarImg');
  const levelBadgeImg = qs('levelBadgeImg');
  const progressFill = qs('progressFill');
  const progressText = qs('progressText');
  const progressPercent = qs('progressPercent');

  const first = profile?.firstName || 'Student';
  welcomeText.textContent = `Welcome, ${first}!`;

  if (profile?.avatarUrl) avatarImg.src = profile.avatarUrl;

  if (levelInfo?.badge) levelBadgeImg.src = levelInfo.badge;

  const points = Number(profile?.points || 0);
  const min = Number(levelInfo?.minPoints ?? 0);
  const max = Number(levelInfo?.maxPoints ?? 1);
  const pct = Math.max(0, Math.min(100, Math.round(((points - min) / (max - min)) * 100)));

  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${points} pts`;
  progressPercent.textContent = `${pct}% complete`;
}

/**
 * Inserts a practice log for a given date if it doesn't already exist.
 * Uses category='practice', points=5, status='approved', isPractice=true, source='student'
 */
async function insertPracticeLogForDate(userId, isoDate) {
  // Check for existing practice entry that day
  const { data: existing, error: existErr } = await supabase
    .from('logs')
    .select('id')
    .eq('userId', userId)
    .eq('date', isoDate)
    .eq('category', 'practice')
    .maybeSingle();

  if (existErr) {
    // If table/column mismatch, fail softly
    console.warn('Practice existence check failed:', existErr);
  }
  if (existing?.id) {
    return { ok: false, reason: 'already_logged' };
  }

  const payload = {
    userId,
    date: isoDate,
    category: 'practice',
    points: 5,
    status: 'approved',
    isPractice: true,
    source: 'student',
  };

  const { error: insErr } = await supabase.from('logs').insert(payload);
  if (insErr) {
    console.error('Practice insert failed:', insErr);
    return { ok: false, reason: 'insert_failed', error: insErr };
  }
  return { ok: true };
}

async function recalcUserPointsAndLevel(userId) {
  // Sum approved points
  const { data: logs, error } = await supabase
    .from('logs')
    .select('points')
    .eq('userId', userId)
    .eq('status', 'approved');

  if (error) {
    console.warn('Could not recalc points:', error);
    return;
  }

  const total = (logs || []).reduce((sum, r) => sum + Number(r.points || 0), 0);

  // Find level by total
  const { data: levels } = await supabase
    .from('levels')
    .select('id, minPoints, maxPoints')
    .order('id', { ascending: true });

  let level = 1;
  (levels || []).forEach(lv => {
    if (total >= Number(lv.minPoints) && total <= Number(lv.maxPoints)) level = lv.id;
  });

  await supabase.from('users').update({ points: total, level }).eq('id', userId);
}

function toast(msg) {
  // Lightweight, no dependencies
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

function wireNavChips() {
  document.querySelectorAll('.chip[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      const hint = btn.dataset.hint || '';
      const url = new URL('log-points.html', window.location.href);
      url.searchParams.set('category', category);
      if (hint) url.searchParams.set('hint', hint);
      window.location.href = url.toString();
    });
  });
}

async function maybeShowWelcomeBackModal(userId) {
  // Look at most recent log date
  const { data, error } = await supabase
    .from('logs')
    .select('date')
    .eq('userId', userId)
    .order('date', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return;

  const lastDate = new Date(data[0].date + 'T00:00:00');
  const now = new Date();
  const days = daysBetween(lastDate, now);

  if (days < 7) return;

  const overlay = qs('welcomeBackOverlay');
  const logPractice = qs('modalLogPractice');
  const logOther = qs('modalLogOther');
  const notNow = qs('modalNotNow');

  overlay.style.display = 'flex';

  notNow.addEventListener('click', () => { overlay.style.display = 'none'; });
  logOther.addEventListener('click', () => {
    overlay.style.display = 'none';
    // scroll to action chips
    document.querySelector('.home-actions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  logPractice.addEventListener('click', async () => {
    overlay.style.display = 'none';
    const iso = todayISO();
    const res = await insertPracticeLogForDate(userId, iso);
    if (res.ok) {
      await recalcUserPointsAndLevel(userId);
      toast('Practice logged ✅');
      // refresh UI
      const profile = await getCurrentUserProfile();
      const levelInfo = await getLevelInfo(profile.level);
      setIdentity(profile, levelInfo);
    } else if (res.reason === 'already_logged') {
      toast('Already logged practice today.');
    } else {
      toast('Could not log practice. Try again.');
    }
  });
}

async function wirePracticeButtons(profile) {
  const quickPracticeBtn = qs('quickPracticeBtn');
  const logPastPracticeBtn = qs('logPastPracticeBtn');

  quickPracticeBtn.addEventListener('click', async () => {
    const iso = todayISO();
    const res = await insertPracticeLogForDate(profile.id, iso);
    if (res.ok) {
      await recalcUserPointsAndLevel(profile.id);
      toast('Practice logged ✅');

      const refreshed = await getCurrentUserProfile();
      const levelInfo = await getLevelInfo(refreshed.level);
      setIdentity(refreshed, levelInfo);
    } else if (res.reason === 'already_logged') {
      toast('Already logged practice today.');
    } else {
      toast('Could not log practice. Try again.');
    }
  });

  logPastPracticeBtn.addEventListener('click', () => {
    const url = new URL('log-points.html', window.location.href);
    url.searchParams.set('mode', 'pastPractice');
    url.searchParams.set('category', 'practice');
    window.location.href = url.toString();
  });
}

async function maybeShowTeacherGoal(profile) {
  // If you later add a tasks table, this will light up automatically.
  // For now it stays hidden unless the query succeeds and returns active tasks.
  const chip = qs('teacherGoalChip');
  if (!chip) return;

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, status')
      .eq('studentId', profile.id)
      .eq('status', 'active')
      .limit(1);

    if (!error && data && data.length > 0) {
      chip.style.display = 'inline-flex';
      chip.addEventListener('click', () => {
        const url = new URL('my-points.html', window.location.href);
        url.searchParams.set('tab', 'tasks');
        window.location.href = url.toString();
      });
    }
  } catch (e) {
    // table likely doesn't exist yet - keep hidden
  }
}

async function init() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    if (DEMO_MODE) {
      console.warn('DEMO_MODE: No profile found even after seeding.');
    } else {
      window.location.href = 'login.html';
      return;
    }
  }

  const levelInfo = await getLevelInfo(profile.level || 1);
  if (levelInfo) setIdentity(profile, levelInfo);

  wireNavChips();
  await wirePracticeButtons(profile);
  await maybeShowWelcomeBackModal(profile.id);
  await maybeShowTeacherGoal(profile);
}

document.addEventListener('DOMContentLoaded', init);