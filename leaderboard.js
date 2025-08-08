// leaderboard.js
import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
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

  if (loadingText) {
    loadingText.textContent = messages[Math.floor(Math.random() * messages.length)];
  }
  if (popup) popup.style.display = "flex";

  // Admin controls (show recalc button only if current user is an admin)
  await setupAdminControls();

  // Render leaderboard from existing user points/levels in Supabase (no DB writes)
  await loadLeaderboard();

  if (popup) popup.style.display = "none";
});

/**
 * Show the "Recalculate All" button for admins and wire its click handler.
 * The recalculation touches Supabase ONLY when an admin explicitly triggers it.
 */
async function setupAdminControls() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const supaUser = auth?.user;
    if (!supaUser) return;

    const { data: me } = await supabase
      .from("users")
      .select("id, roles")
      .eq("id", supaUser.id)
      .single();

    const isAdmin = Array.isArray(me?.roles) ? me.roles.includes("admin") : me?.roles === "admin";
    const btn = document.getElementById("recalcAllBtn");

    if (isAdmin && btn) {
      btn.style.display = "inline-block";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = "Recalculating...";
        try {
          await recalculateAllUsers();   // recomputes from logs -> writes users.points/level
          await loadLeaderboard();       // refresh UI after recalc
          alert("All users recalculated.");
        } catch (e) {
          console.error(e);
          alert("Recalculation failed. Check console for details.");
        } finally {
          btn.disabled = false;
          btn.textContent = oldText;
        }
      });
    } else if (btn) {
      // hide for non-admins
      btn.style.display = "none";
    }
  } catch (err) {
    console.error("[ERROR] setupAdminControls:", err);
  }
}

/**
 * Load leaderboard purely from Users + Levels tables.
 * DOES NOT update Supabase — read-only.
 */
async function loadLeaderboard() {
  const container = document.getElementById("leaderboardContainer");
  if (!container) return;
  container.innerHTML = "";

  try {
    const [{ data: users }, { data: levels }] = await Promise.all([
      supabase
        .from("users")
        .select("id, firstName, lastName, avatarUrl, roles, points, level"),
      supabase
        .from("levels")
        .select("*")
        .order("minPoints", { ascending: true })
    ]);

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
        const isStudent = Array.isArray(user.roles)
          ? user.roles.includes("student")
          : user.roles === "student";
        if (!isStudent || user.level !== level.id) return;

        // Position based on stored points vs level min/max — read-only
        const span = Math.max(1, (level.maxPoints - level.minPoints));
        const percent = ((Number(user.points) - level.minPoints) / span) * 100;
        const clampedPercent = Math.min(100, Math.max(0, percent));

        const spacingThreshold = 3, bumpX = 6, bumpY = 22, maxStack = 3;
        let bumpLevel = 0, adjustedLeft = clampedPercent;

        while (placedAvatars.some(p => Math.abs(p.left - adjustedLeft) < spacingThreshold && p.top === bumpLevel)) {
          bumpLevel++;
          if (bumpLevel >= maxStack) {
            bumpLevel = 0;
            adjustedLeft += bumpX;
          }
        }
        placedAvatars.push({ left: adjustedLeft, top: bumpLevel });

        if (user.avatarUrl && user.avatarUrl.trim() !== "") {
          const avatar = document.createElement("img");
          avatar.src = user.avatarUrl;
          avatar.classList.add("avatar");
          avatar.alt = `${user.firstName} ${user.lastName}`;
          avatar.title = `${user.firstName} ${user.lastName} (${user.points ?? 0} pts)`;
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

/**
 * Admin-only recalculation: recompute each user's points from APPROVED logs
 * and write back users.points / users.level. This is only called on button click.
 */
async function recalculateAllUsers() {
  const [{ data: users }, { data: logs }, { data: levels }] = await Promise.all([
    supabase.from("users").select("id, firstName, roles"),
    supabase.from("logs").select("*").eq("status", "approved"),
    supabase.from("levels").select("*").order("minPoints", { ascending: true }),
  ]);

  if (!users || !logs || !levels) throw new Error("Missing users/logs/levels");

  // Fast in-memory map of totals
  const totals = new Map();
  for (const log of logs) {
    const uid = String(log.userId).trim();
    const prev = totals.get(uid) || 0;
    totals.set(uid, prev + (parseInt(log.points) || 0));
  }

  // Batch over users
  for (const u of users) {
    const totalPoints = totals.get(String(u.id).trim()) || 0;
    let userLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!userLevel) userLevel = levels[levels.length - 1];

    await supabase
      .from("users")
      .update({ points: totalPoints, level: userLevel?.id || 1 })
      .eq("id", u.id);
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
