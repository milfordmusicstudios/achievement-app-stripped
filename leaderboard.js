// leaderboard.js
import { supabase } from "./supabaseClient.js";
import { ensureStudioContextAndRoute } from "./studio-routing.js";

document.addEventListener("DOMContentLoaded", async () => {
  const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
  if (routeResult?.redirected) return;

  const popup = document.getElementById("loadingPopup");
  const loadingText = document.getElementById("loadingMessage");

  const messages = [
    "🎶 Loading the rhythm of success…",
    "🎸 Tuning up the strings of greatness…",
    "🥁 Drumming up some excitement…",
    "🎹 Hitting all the right keys…",
    "🎤 Mic check... 1, 2, 3, almost there!",
    "🎧 Mixing the perfect soundtrack for victory…",
    "🎼 Arranging the notes of achievement…",
    "🎻 Violins of victory are warming up…",
    "🔥 Shredding through the data like a solo guitar riff…",
    "🏆 Composing the champions’ anthem…",
    "💃 Dancing through the scores…",
    "🧩 Piecing together the perfect harmony…",
    "🎶 Where words fail, music speaks… loading greatness…",
    "🌟 Every note counts… loading your masterpiece…"
  ];

  if (loadingText) loadingText.textContent = messages[Math.floor(Math.random() * messages.length)];
  if (popup) popup.style.display = "flex";

  await loadLeaderboard(); // read-only

  if (popup) popup.style.display = "none";
});

/** Read-only leaderboard: uses users.points & users.level as-is */
async function loadLeaderboard() {
  const container = document.getElementById("leaderboardContainer");
  if (!container) return;
  container.innerHTML = "";

  try {
    const [{ data: users }, { data: levels }] = await Promise.all([
      supabase.from("users").select("id, firstName, lastName, avatarUrl, roles, points, level"),
      supabase.from("levels").select("*").order("minPoints", { ascending: true })
    ]);

    // Keep an ascending copy for overlay math (minPoints -> next minPoints)
    window.__LEVELS_ASC__ = [...(levels || [])].sort((a, b) => (a.minPoints ?? 0) - (b.minPoints ?? 0));

    // Existing rendering order (highest level first)
    const sortedLevels = [...(levels || [])].sort((a, b) => b.id - a.id);

    for (const level of sortedLevels) {
      const levelRow = document.createElement("div");
      levelRow.classList.add("level-row");

      const badge = document.createElement("img");
      badge.src = level.badge || `images/levelBadges/level${level.id}.png`;
      badge.classList.add("level-badge-icon");

      const levelTrack = document.createElement("div");
      levelTrack.classList.add("level-track");
      levelTrack.style.backgroundColor = level.color || "#3eb7f8";
      levelTrack.style.border = `4px solid ${darkenColor(level.color || "#3eb7f8")}`;

      const avatarTrack = document.createElement("div");
      avatarTrack.classList.add("avatar-track");
      const placedAvatars = [];

      (users || []).forEach(user => {
        const isStudent = Array.isArray(user.roles) ? user.roles.includes("student") : user.roles === "student";
        if (!isStudent || user.level !== level.id) return;

        const span = Math.max(1, (level.maxPoints - level.minPoints));
        const percent = ((Number(user.points) - level.minPoints) / span) * 100;
        const clampedPercent = Math.min(100, Math.max(0, percent));

        const spacingThreshold = 3, bumpX = 6, bumpY = 22, maxStack = 3;
        let bumpLevel = 0, adjustedLeft = clampedPercent;

        while (placedAvatars.some(p => Math.abs(p.left - adjustedLeft) < spacingThreshold && p.top === bumpLevel)) {
          bumpLevel++;
          if (bumpLevel >= maxStack) { bumpLevel = 0; adjustedLeft += bumpX; }
        }
        placedAvatars.push({ left: adjustedLeft, top: bumpLevel });

        if (user.avatarUrl && user.avatarUrl.trim() !== "") {
          const avatar = document.createElement("img");
          avatar.src = user.avatarUrl;
          avatar.classList.add("avatar");
          // NEW: add a dedicated class for overlay targeting (doesn't affect existing styles)
          avatar.classList.add("leaderboard-avatar");

          // Gate whether hover title shows name (students only see points)
          const canSeeNames = (() => {
            const role = (localStorage.getItem('activeRole') || '').toLowerCase();
            return role === 'admin' || role === 'teacher';
          })();

          avatar.alt = `${user.firstName} ${user.lastName}`;
          avatar.title = canSeeNames
            ? `${user.firstName} ${user.lastName} (${user.points ?? 0} pts)`
            : `${user.points ?? 0} pts`;

          // Provide data for the overlay (no visual change)
          avatar.dataset.userId = user.id;
          avatar.dataset.points = String(user.points ?? 0);
          // Include dataset.name; overlay still gates visibility by role
          avatar.dataset.name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();

          avatar.style.left = `${adjustedLeft}%`;
          avatar.style.top = `${10 + bumpLevel * bumpY}px`;

          const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser"));
          if (loggedInUser && user.id === loggedInUser.id) {
            avatar.style.zIndex = "999";
            avatar.style.border = "3px solid gold";
          }

          avatarTrack.appendChild(avatar);
        }
      });

      levelTrack.appendChild(avatarTrack);
      levelRow.appendChild(badge);
      levelRow.appendChild(levelTrack);
      container.appendChild(levelRow);
    }
  } catch (err) {
    console.error("[ERROR] Rendering leaderboard:", err);
  }
}

function darkenColor(hex, amt = -30) {
  try {
    let col = hex.replace("#", "");
    if (col.length === 3) col = col.split("").map(c => c + c).join("");
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt, g = ((num >> 8) & 0x00FF) + amt, b = (num & 0x0000FF) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  } catch {
    return "#222";
  }
}

/* ====== Gated popup overlay (append-only logic) ====== */

// Helper math
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function computeLevelAndPercent(points) {
  const levelsAsc = Array.isArray(window.__LEVELS_ASC__) ? window.__LEVELS_ASC__ : [];
  if (!levelsAsc.length) return { levelNumber: 1, percentWithin: 0 };

  // find current level by minPoints threshold
  let idx = 0;
  for (let i = 0; i < levelsAsc.length; i++) {
    if (points >= (levelsAsc[i].minPoints ?? 0)) idx = i; else break;
  }
  const current = levelsAsc[idx];
  const next = levelsAsc[idx + 1];

  const levelNumber = (current?.id != null)
    ? Number(current.id)
    : (idx + 1);

  if (!next) return { levelNumber, percentWithin: 1 };

  const span = Math.max(1, (next.minPoints - current.minPoints));
  const pct = clamp((points - current.minPoints) / span, 0, 1);
  return { levelNumber, percentWithin: pct };
}
function squareFromPercent(p01) {
  // 0%→1 … 100%→12
  return clamp(Math.ceil(p01 * 12), 1, 12);
}

// Role check
function viewerCanSeeNames() {
  const role = (localStorage.getItem('activeRole') || '').toLowerCase();
  return role === 'admin' || role === 'teacher';
}function viewerIsAdmin() {
  const role = (localStorage.getItem('activeRole') || '').toLowerCase();
  return role === 'admin';
}


// Overlay UI
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
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') card.remove(); });
    document.body.appendChild(card);
  }
  return card;
}
function showOverlay({ x, y, name, points, levelNumber, square }) {
  const card = ensureOverlay();
  const nameRow = (name && viewerCanSeeNames())
    ? `<div style="font-weight:700; color:#00477d; margin-bottom:4px;">${name}</div>`
    : '';

  const squarePart = viewerIsAdmin() ? ` • square <b>${square}</b>/12` : '';

  card.innerHTML = `
    ${nameRow}
    <div style="margin-bottom:2px;">Points: <b>${Number(points) || 0}</b></div>
    <div>Level <b>${levelNumber}</b>${squarePart}</div>
    <div style="margin-top:6px; font-size:12px; color:#666;">(click or press Esc to dismiss)</div>
  `;

  const pad = 8;
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

// Delegated click handler (works with dynamically added avatars)
document.addEventListener('click', (e) => {
  const el = e.target.closest('.leaderboard-avatar');
  if (!el) return;

  const points = Number(el.dataset.points || '0');
  const { levelNumber, percentWithin } = computeLevelAndPercent(points);
  const square = squareFromPercent(percentWithin);

  const name = el.dataset.name || null;

  showOverlay({
    x: e.clientX,
    y: e.clientY,
    name,
    points,
    levelNumber,
    square
  });
});
