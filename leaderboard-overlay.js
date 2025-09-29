// leaderboard-overlay.js
// Shows an overlay when you click a student's avatar on the leaderboard.
// Overlay includes: points, "Level N • square X/12", and (name only for admin/teacher).
//
// Requirements:
//  - Each avatar element should have at least data-user-id, and (optionally) data-points.
//    If the viewer is allowed (admin/teacher), data-name may be used, but it's not required.
//  - localStorage.activeRole must be set in your app (e.g., 'admin', 'teacher', 'student', 'parent').
//  - A Supabase "levels" table must exist with some numeric "minimum point" column.
//    We'll try to auto-detect the column: minPoints | min_points | min | threshold.
//
// Optional global overrides (define before loading this file):
//   window.LEADERBOARD_AVATAR_SELECTOR = '.your-avatar-class';
//
// You can also call window.attachLeaderboardOverlay('.your-avatar-class') manually if preferred.

import { supabase } from './supabase.js';

const NAME_ROLES = new Set(['admin', 'teacher']); // who can see names
const DEFAULT_SELECTOR = '.leaderboard-avatar';

let LEVELS_CACHE = null;
let AVATAR_SELECTOR = null;

// ---- Role helpers ----
function getActiveRole() {
  const r = (localStorage.getItem('activeRole') || '').toLowerCase();
  return r || 'student';
}
function canSeeNames() {
  return NAME_ROLES.has(getActiveRole());
}

// ---- Utils ----
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function getMinPointsField(row) {
  // Try common field names
  if (typeof row.minPoints === 'number') return 'minPoints';
  if (typeof row.min_points === 'number') return 'min_points';
  if (typeof row.min === 'number') return 'min';
  if (typeof row.threshold === 'number') return 'threshold';
  // fallback: find first numeric field
  for (const k of Object.keys(row)) {
    if (typeof row[k] === 'number') return k;
  }
  return null;
}
function getMinPointsValue(row) {
  const f = getMinPointsField(row);
  return f ? Number(row[f]) : 0;
}
function nameFromRow(row) {
  const fn = row.firstName ?? row.first_name ?? '';
  const ln = row.lastName ?? row.last_name ?? '';
  return `${fn} ${ln}`.trim();
}

// ---- Levels ----
async function getLevels() {
  if (LEVELS_CACHE) return LEVELS_CACHE;

  // Pull everything; sort locally by detected min-points field to be resilient
  const { data, error } = await supabase
    .from('levels')
    .select('*'); // avoid ordering by an unknown column
  if (error) throw error;

  const levels = (data || []).slice().sort((a, b) => getMinPointsValue(a) - getMinPointsValue(b));

  // Normalize into a simple structure we can rely on
  LEVELS_CACHE = levels.map((row, i) => ({
    idx: i,                              // 0-based order
    id: row.id ?? (i + 1),               // keep id if given
    minPoints: getMinPointsValue(row),   // numeric threshold
    raw: row
  }));
  return LEVELS_CACHE;
}

function computeLevelInfo(points, levels) {
  if (!Array.isArray(levels) || !levels.length) {
    return { levelNumber: 1, percentWithin: 0 };
  }
  let idx = 0;
  for (let i = 0; i < levels.length; i++) {
    if (points >= levels[i].minPoints) idx = i; else break;
  }
  const current = levels[idx];
  const next = levels[idx + 1];

  // levelNumber is 1-based for display
  const levelNumber = (current?.idx ?? 0) + 1;

  if (!next) {
    // top level: treat as complete
    return { levelNumber, percentWithin: 1 };
  }
  const span = (next.minPoints - current.minPoints) || 1;
  const pct = clamp((points - current.minPoints) / span, 0, 1);
  return { levelNumber, percentWithin: pct };
}

function squareFromPercent(p01) {
  // Convert 0–1 to 1–12 boxes (inclusive)
  return clamp(Math.ceil(p01 * 12), 1, 12);
}

// ---- Overlay UI ----
function ensureOverlay() {
  let card = document.getElementById('lb-overlay-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'lb-overlay-card';
    Object.assign(card.style, {
      position: 'fixed',
      zIndex: '9999',
      background: 'white',
      border: '1px solid rgba(0,0,0,.12)',
      borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,.18)',
      padding: '10px 12px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      fontSize: '14px',
      color: '#222'
    });
    card.addEventListener('click', () => card.remove());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') card.remove();
    });
    document.body.appendChild(card);
  }
  return card;
}

function showOverlay({ x, y, name, points, levelNumber, square }) {
  const card = ensureOverlay();

  const nameLine = (name && canSeeNames())
    ? `<div style="font-weight:700; color:#00477d; margin-bottom:4px;">${name}</div>`
    : '';

  card.innerHTML = `
    ${nameLine}
    <div style="margin-bottom:2px;">Points: <b>${Number(points) || 0}</b></div>
    <div>Level <b>${levelNumber}</b> • square <b>${square}</b>/12</div>
    <div style="margin-top:6px; font-size:12px; color:#666;">(click or press Esc to dismiss)</div>
  `;

  const pad = 8;
  // basic viewport-aware placement
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const rect = card.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > vw - 8) left = vw - rect.width - 8;
  if (top + rect.height > vh - 8) top = vh - rect.height - 8;

  card.style.left = Math.max(8, left) + 'px';
  card.style.top  = Math.max(8, top)  + 'px';
}

// ---- Core click handler ----
async function handleAvatarClick(e) {
  const el = e.target.closest(AVATAR_SELECTOR || DEFAULT_SELECTOR);
  if (!el) return;

  try {
    const levels = await getLevels();

    const id = el.dataset.userId;
    let points = el.dataset.points ? Number(el.dataset.points) : null;

    let displayName = null;
    // Only read DOM-provided name when allowed, to avoid accidental leaks
    if (canSeeNames() && el.dataset.name) {
      displayName = String(el.dataset.name);
    }

    // Fetch missing info from DB. Avoid selecting names if viewer isn't allowed.
    if (points == null || (canSeeNames() && !displayName)) {
      const selectCols = canSeeNames() ? 'firstName, lastName, first_name, last_name, points' : 'points';

      const { data, error } = await supabase
        .from('users')
        .select(selectCols)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (points == null) points = Number(data?.points ?? 0);
      if (canSeeNames() && !displayName) {
        const n = nameFromRow(data || {});
        if (n) displayName = n;
      }
    }

    const { levelNumber, percentWithin } = computeLevelInfo(Number(points) || 0, levels);
    const square = squareFromPercent(percentWithin);

    showOverlay({
      x: e.clientX,
      y: e.clientY,
      name: displayName,
      points,
      levelNumber,
      square
    });
  } catch (err) {
    console.error('[leaderboard-overlay] error:', err);
  }
}

// ---- Public attach API ----
export function attachLeaderboardOverlay(selector = DEFAULT_SELECTOR) {
  AVATAR_SELECTOR = selector || DEFAULT_SELECTOR;
  // Event delegation means we only need one listener, even if avatars load later
  document.addEventListener('click', handleAvatarClick);
}

// ---- Auto attach on DOM ready (can be overridden) ----
document.addEventListener('DOMContentLoaded', () => {
  const sel = window.LEADERBOARD_AVATAR_SELECTOR || DEFAULT_SELECTOR;
  attachLeaderboardOverlay(sel);
});
