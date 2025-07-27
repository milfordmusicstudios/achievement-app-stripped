import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DEBUG] My Points: Script loaded");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  const userId = user.id;

  // DOM Elements
  const logsTableBody = document.querySelector("#logsTable tbody");
  const categorySummary = document.getElementById("categorySummary");
  const levelBadge = document.getElementById("levelBadge");

  try {
    // ✅ Fetch logs
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", userId)
      .order("date", { ascending: false });

    if (logsError) throw logsError;
    console.log("[DEBUG] Logs fetched:", logs);

    // ✅ Fetch levels
    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("*");

    if (levelsError) throw levelsError;
    console.log("[DEBUG] Levels fetched:", levels);

    // ✅ Calculate totals
    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);
    const categoryTotals = {};
    logs.forEach(log => {
      const cat = log.category || "unknown";
      if (!categoryTotals[cat]) categoryTotals[cat] = { points: 0, logs: 0 };
      categoryTotals[cat].points += log.points || 0;
      categoryTotals[cat].logs++;
    });

    // ✅ Determine user level correctly
    levels.sort((a, b) => a.minPoints - b.minPoints);
    let userLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!userLevel && levels.length > 0) userLevel = levels[levels.length - 1];
    if (!userLevel) userLevel = { id: 1, badge: "images/levelBadges/level1.png" };

    console.log("[DEBUG] User Level determined:", userLevel);

    // ✅ Update user points & level in Supabase
    const { error: updateError } = await supabase
      .from("users")
      .update({ points: totalPoints, level: userLevel.id })
      .eq("id", userId);
    if (updateError) console.error("[ERROR] Failed to update user:", updateError);

    // ✅ Set level badge
    levelBadge.src = userLevel.badge || "images/levelBadges/level1.png";

    // ✅ Render category summary cards
    renderCategorySummary(categoryTotals, totalPoints);

    // ✅ Render logs table
    renderLogs(logs);

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }

  // --- FUNCTIONS ---

  function renderCategorySummary(totals, totalPoints) {
    categorySummary.innerHTML = "";

    const icons = {
      practice: "images/categories/practice.png",
      participation: "images/categories/participation.png",
      performance: "images/categories/performance.png",
      personal: "images/categories/personal.png",
      proficiency: "images/categories/proficiency.png",
      total: "images/categories/allCategories.png"
    };

    const categories = ["practice", "participation", "performance", "personal", "proficiency"];

    categories.forEach(cat => {
      const points = totals[cat]?.points || 0;
      const count = totals[cat]?.logs || 0;

      categorySummary.innerHTML += `
        <div class="category-card">
          <img src="${icons[cat]}" alt="${cat}" />
          <h3>${points} pts</h3>
          <p>${count} logs</p>
        </div>`;
    });

    // Total points card
    categorySummary.innerHTML += `
      <div class="category-card total-card">
        <img src="${icons.total}" alt="All Categories" />
        <h3>${totalPoints} pts</h3>
        <p>${Object.values(totals).reduce((sum, c) => sum + c.logs, 0)} logs</p>
      </div>`;
  }

  function renderLogs(logs) {
    logsTableBody.innerHTML = "";
    logs.forEach((log, i) => {
      const icon = `images/categories/${log.category || "allCategories"}.png`;
      logsTableBody.innerHTML += `
        <tr class="${i % 2 === 0 ? 'log-row-even' : 'log-row-odd'}">
          <td><img src="${icon}" style="width:30px;height:30px"></td>
          <td>${new Date(log.date).toLocaleDateString()}</td>
          <td>${log.points}</td>
          <td>${log.notes || ""}</td>
        </tr>`;
    });
  }
});
