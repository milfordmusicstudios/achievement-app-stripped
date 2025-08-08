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
