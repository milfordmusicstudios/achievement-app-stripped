import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  try {
    // ✅ Fetch logs for the current user
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", user.id);

    if (logsError) throw logsError;

    // ✅ Fetch levels from Supabase
    const { data: levelsData, error: levelsError } = await supabase
      .from("levels")
      .select("*");

    if (levelsError) throw levelsError;

    // Convert level min/max to numbers for comparison
    const levels = levelsData.map(l => ({
      ...l,
      minPoints: Number(l.minPoints),
      maxPoints: Number(l.maxPoints)
    }));

    // ✅ Calculate total points
    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);

    // ✅ Find correct level
    let userLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!userLevel) {
      userLevel = levels[levels.length - 1];
    }

    // ✅ Update Supabase user record with points and level
    const { error: updateError } = await supabase
      .from("users")
      .update({ points: totalPoints, level: userLevel.id })
      .eq("id", user.id);

    if (updateError) console.error("Failed to update user points/level:", updateError);

    // ✅ Render Level Badge
    const badgeImg = document.getElementById("levelBadge");
    badgeImg.src = userLevel.badge || "images/levelBadges/level1.png";
    badgeImg.alt = `Level ${userLevel.id}`;

    // ✅ Render Category Summary Cards
    renderCategorySummary(logs);

    // ✅ Render Logs Table
    renderLogs(logs);

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }
});

/* ---------- RENDER FUNCTIONS ---------- */
function renderCategorySummary(logs) {
  const container = document.getElementById("categorySummary");
  if (!container) return;

  const categories = ["practice", "participation", "performance", "proficiency", "personal"];
  const icons = {
    practice: "images/categories/practice.png",
    participation: "images/categories/participation.png",
    performance: "images/categories/performance.png",
    proficiency: "images/categories/proficiency.png",
    personal: "images/categories/personal.png",
    total: "images/categories/allCategories.png"
  };

  container.innerHTML = "";

  // Build category cards
  categories.forEach(cat => {
    const catLogs = logs.filter(l => l.category === cat);
    const points = catLogs.reduce((sum, l) => sum + (l.points || 0), 0);

    container.innerHTML += `
      <div class="category-card">
        <img src="${icons[cat]}" alt="${cat}">
        <h3>${points} pts</h3>
        <p>${catLogs.length} logs</p>
      </div>`;
  });

  // Total Points Card
  const totalPoints = logs.reduce((sum, l) => sum + (l.points || 0), 0);
  container.innerHTML += `
    <div class="category-card total-card">
      <img src="${icons.total}" alt="Total Points">
      <h3>${totalPoints} pts</h3>
      <p>${logs.length} logs</p>
    </div>`;
}

function renderLogs(logs) {
  const tbody = document.getElementById("logsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const categoryIcons = {
    practice: "images/categories/practice.png",
    participation: "images/categories/participation.png",
    performance: "images/categories/performance.png",
    proficiency: "images/categories/proficiency.png",
    personal: "images/categories/personal.png"
  };

  logs.forEach((log, index) => {
    const icon = categoryIcons[log.category] || categoryIcons.practice;
    const rowClass = index % 2 === 0 ? "log-row-even" : "log-row-odd";

    tbody.innerHTML += `
      <tr class="${rowClass}">
        <td><img src="${icon}" alt="${log.category}" style="width:40px;height:auto;"></td>
        <td>${new Date(log.date).toLocaleDateString()}</td>
        <td>${log.points}</td>
        <td>${log.notes || ""}</td>
      </tr>`;
  });
}
