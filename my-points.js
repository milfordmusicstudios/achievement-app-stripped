import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const logsTableBody = document.querySelector("#logsTable tbody");
  const categorySummary = document.getElementById("categorySummary");
  const levelBadge = document.getElementById("levelBadge");

  try {
    // ✅ Fetch logs for this user
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", user.id)
      .order("date", { ascending: false });

    if (logsError) throw logsError;

    // ✅ Category icons map
    const categoryIcons = {
      performance: "images/categories/performance.png",
      participation: "images/categories/participation.png",
      practice: "images/categories/practice.png",
      personal: "images/categories/personal.png",
      proficiency: "images/categories/proficiency.png"
    };

    // ✅ Calculate totals per category
    const categoryTotals = {};
    let totalPoints = 0;
    logs.forEach(log => {
      totalPoints += log.points;
      if (!categoryTotals[log.category]) {
        categoryTotals[log.category] = { points: 0, count: 0 };
      }
      categoryTotals[log.category].points += log.points;
      categoryTotals[log.category].count++;
    });

    // ✅ Fetch levels to determine user’s current level
    const { data: levels, error: levelsError } = await supabase.from("levels").select("*");
    if (levelsError) throw levelsError;

    let userLevelId = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints)?.id || 1;

    // ✅ Update user stats in Supabase
    await updateUserStats(user.id, totalPoints, userLevelId);

    // ✅ Render level badge (fallback to Level 1 badge if missing)
    const currentLevel = levels.find(l => l.id === userLevelId);
    levelBadge.src = currentLevel?.badge || "images/levelBadges/level1.png";

    // ✅ Render category summary
    renderCategorySummary(categoryTotals, totalPoints, logs.length, categoryIcons);

    // ✅ Render logs table
    renderLogsTable(logs, logsTableBody, categoryIcons);

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }
});

/* ✅ Update user points and level in Supabase */
async function updateUserStats(userId, totalPoints, userLevelId) {
  const { error } = await supabase
    .from("users")
    .update({ points: totalPoints, level: userLevelId })
    .eq("id", userId);

  if (error) console.error("[ERROR] Updating user stats:", error);
}

/* ✅ Render category summary cards */
function renderCategorySummary(totals, totalPoints, totalLogs, icons) {
  const container = document.getElementById("categorySummary");
  container.innerHTML = "";

  const categories = ["performance", "participation", "practice", "personal", "proficiency"];
  categories.forEach(cat => {
    const data = totals[cat] || { points: 0, count: 0 };
    container.innerHTML += `
      <div class="category-card">
        <img src="${icons[cat]}" alt="${cat}" />
        <h3>${data.points} pts</h3>
        <p>${data.count} logs</p>
      </div>`;
  });

  // ✅ Add Total Points card
  container.innerHTML += `
    <div class="category-card total-card">
      <img src="images/categories/allCategories.png" alt="All Categories" />
      <h3>${totalPoints} pts</h3>
      <p>${totalLogs} logs</p>
    </div>`;
}

/* ✅ Render logs table with category icon first */
function renderLogsTable(logs, tableBody, icons) {
  if (!tableBody) return;
  tableBody.innerHTML = "";
  logs.forEach((log, index) => {
    tableBody.innerHTML += `
      <tr class="${index % 2 === 0 ? 'log-row-even' : 'log-row-odd'}">
        <td><img src="${icons[log.category] || icons.default}" style="width:30px;height:30px"/></td>
        <td>${new Date(log.date).toLocaleDateString()}</td>
        <td>${log.points}</td>
        <td>${log.notes || ""}</td>
      </tr>`;
  });
}
