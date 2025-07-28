import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  // Show popup immediately
  const popup = document.getElementById("loadingPopup");
  if (popup) popup.style.display = "flex";

  await updateAllUsersLevels();   // ✅ First, sync points & levels
  await generateLeaderboard();    // ✅ Then render leaderboard

  // Hide popup when loading completes
  if (popup) popup.style.display = "none";
});

// 🔹 Step 1: Sync all users' levels
async function updateAllUsersLevels() {
  try {
    const [{ data: users, error: usersErr },
           { data: logs, error: logsErr },
           { data: levels, error: levelsErr }] = await Promise.all([
      supabase.from("users").select("id, roles"),
      supabase.from("logs").select("*").eq("status", "approved"),
      supabase.from("levels").select("*").order("minPoints", { ascending: true })
    ]);

    if (usersErr || logsErr || levelsErr) throw usersErr || logsErr || levelsErr;

    for (const user of users) {
      const userLogs = logs.filter(l => l.userId === user.id);
      const totalPoints = userLogs.reduce((sum, l) => sum + (l.points || 0), 0);

      let userLevel = levels.find(l =>
        totalPoints >= Number(l.minPoints) && totalPoints <= Number(l.maxPoints)
      );
      if (!userLevel && levels.length > 0) userLevel = levels[levels.length - 1];

      await supabase.from("users")
        .update({ points: totalPoints, level: userLevel?.id || 1 })
        .eq("id", user.id);
    }

    console.log("[INFO] All user levels synced successfully.");
  } catch (err) {
    console.error("[ERROR] Syncing user levels:", err);
  }
}

// 🔹 Step 2: Render the leaderboard with scrollable level tracks
async function generateLeaderboard() {
  const container = document.getElementById("leaderboardContainer");
  if (!container) return;

  container.innerHTML = "";

  try {
    const [{ data: users }, { data: logs }, { data: levels }] = await Promise.all([
      supabase.from("users").select("id, firstName, lastName, avatarUrl, roles, points, level"),
      supabase.from("logs").select("*").eq("status", "approved"),
      supabase.from("levels").select("*").order("minPoints", { ascending: true })
    ]);

    const sortedLevels = [...levels].sort((a, b) => b.id - a.id);

    for (const level of sortedLevels) {
      const levelRow = document.createElement("div");
      levelRow.classList.add("level-row");

      // 🔹 Level Badge (Left)
      const badge = document.createElement("img");
      badge.src = level.badge || `images/levelBadges/level${level.id}.png`;
      badge.classList.add("level-badge-icon");
      badge.style.marginRight = "10px";
      badge.style.width = "60px";
      badge.style.height = "60px";

      // 🔹 Scrollable Container for Track
      const scrollBox = document.createElement("div");
      scrollBox.classList.add("level-scroll-box");

      // 🔹 Level Track
      const levelTrack = document.createElement("div");
      levelTrack.classList.add("level-track");
      levelTrack.style.backgroundColor = level.color || "#3eb7f8";
      levelTrack.style.border = `4px solid ${darkenColor(level.color || "#3eb7f8")}`;

      const avatarTrack = document.createElement("div");
      avatarTrack.classList.add("avatar-track");

      const placedAvatars = [];

      users.forEach(user => {
        const isStudent = Array.isArray(user.roles) ? user.roles.includes("student") : user.roles === "student";
        if (!isStudent) return;
        if (user.level !== level.id) return;

        const percent = ((user.points - level.minPoints) / (level.maxPoints - level.minPoints)) * 100;
        const spacingThreshold = 3;
        const bumpX = 6;
        const bumpY = 22;
        const maxStack = 3;
        let bumpLevel = 0;
        let adjustedLeft = percent;

        while (placedAvatars.some(p => Math.abs(p.left - adjustedLeft) < spacingThreshold && p.top === bumpLevel)) {
          bumpLevel++;
          if (bumpLevel >= maxStack) { bumpLevel = 0; adjustedLeft += bumpX; }
        }
        placedAvatars.push({ left: adjustedLeft, top: bumpLevel });

        const avatar = document.createElement("img");
        avatar.src = user.avatarUrl || "images/logos/default.png";
        avatar.classList.add("avatar");
        avatar.alt = `${user.firstName} ${user.lastName}`;
        avatar.title = `${user.firstName} ${user.lastName} (${user.points} pts)`;
        avatar.style.left = `${adjustedLeft}%`;
        avatar.style.top = `${10 + bumpLevel * bumpY}px`;

        avatarTrack.appendChild(avatar);
      });

      levelTrack.appendChild(avatarTrack);
      scrollBox.appendChild(levelTrack);

      levelRow.appendChild(badge);
      levelRow.appendChild(scrollBox);
      container.appendChild(levelRow);
    }
  } catch (err) {
    console.error("[ERROR] Rendering leaderboard:", err);
  }
}

// 🔹 Helper: Darken border color
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
