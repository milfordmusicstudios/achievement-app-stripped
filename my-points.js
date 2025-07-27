import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DEBUG] My Points: Script loaded");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user || !user.id) {
    alert("User session not found. Please log in again.");
    window.location.href = "login.html";
    return;
  }

  const userId = user.id;
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
    const { data: levelsData, error: levelsError } = await supabase
      .from("levels")
      .select("*")
      .order("minPoints", { ascending: true });

    if (levelsError) throw levelsError;
    console.log("[DEBUG] Levels fetched:", levelsData);

    // ✅ Calculate totals
    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);
    console.log("[DEBUG] Total points calculated:", totalPoints);

    // ✅ Calculate level correctly
    let userLevel = levelsData.find(l =>
      totalPoints >= Number(l.minPoints) && totalPoints <= Number(l.maxPoints)
    );
    if (!userLevel && levelsData.length > 0) userLevel = levelsData[levelsData.length - 1];

    console.log("[DEBUG] User Level determined:", userLevel);

    // ✅ Update user record in Supabase
    if (userLevel) {
      const { error: updateError } = await supabase
        .from("users")
        .update({ points: totalPoints, level: userLevel.id })
        .eq("id", userId);

      if (updateError) console.error("[ERROR] Failed to update user level:", updateError);
      else console.log("[DEBUG] User points & level updated in Supabase");
    }

    // ✅ Set level badge
    levelBadge.src = userLevel?.badge || "images/levelBadges/level1.png";

    // ✅ Render category summary
    renderCategorySummary(logs, totalPoints);

    // ✅ Render logs table
    renderLogs(logs);

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }

  // ---- RENDER FUNCTIONS ----

  function renderCategorySummary(logs, totalPoints) {
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
    const totals = {};
    logs.forEach(l => {
      const cat = l.category?.toLowerCase();
      if (!totals[cat]) totals[cat] = { points: 0, logs: 0 };
      totals[cat].points += l.points || 0;
      totals[cat].logs++;
    });

    categories.forEach(cat => {
      const c = totals[cat] || { points: 0, logs: 0 };
      categorySummary.innerHTML += `
        <div class="category-card">
          <img src="${icons[cat]}" alt="${cat}">
          <h3>${c.points} pts</h3>
          <p>${c.logs} logs</p>
        </div>`;
    });

    categorySummary.innerHTML += `
      <div class="category-card total-card">
        <img src="${icons.total}" alt="Total">
        <h3>${totalPoints} pts</h3>
        <p>${logs.length} logs</p>
      </div>`;
  }

  function renderLogs(logs) {
    logsTableBody.innerHTML = "";
    logs.forEach((log, index) => {
      const icon = `images/categories/${log.category || "allCategories"}.png`;
      logsTableBody.innerHTML += `
        <tr class="${index % 2 === 0 ? 'log-row-even' : 'log-row-odd'}">
          <td><img src="${icon}" style="width:30px;height:30px"></td>
          <td>${new Date(log.date).toLocaleDateString()}</td>
          <td>${log.points}</td>
          <td>${log.notes || ""}</td>
        </tr>`;
    });
  }
});
