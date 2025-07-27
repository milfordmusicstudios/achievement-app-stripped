import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  try {
    // 1️⃣ Fetch logs for this user
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", user.id)
      .order("date", { ascending: false });

    if (logsError) throw logsError;

    // 2️⃣ Fetch level data
    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("*");
    if (levelsError) throw levelsError;

    // 3️⃣ Define category icons
    const categoryIcons = {
      practice: "images/categories/practice.png",
      participation: "images/categories/participation.png",
      performance: "images/categories/performance.png",
      personal: "images/categories/personal.png",
      proficiency: "images/categories/proficiency.png",
      all: "images/categories/allCategories.png",
    };

    // 4️⃣ Calculate category summaries
    const categories = ["practice", "participation", "performance", "personal", "proficiency"];
    const categorySummary = {};
    let totalPoints = 0;

    categories.forEach(cat => categorySummary[cat] = { points: 0, logs: 0 });

    logs.forEach(log => {
      if (categorySummary[log.category]) {
        categorySummary[log.category].points += log.points;
        categorySummary[log.category].logs += 1;
      }
      totalPoints += log.points;
    });

    // 5️⃣ Determine current level
    const currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) || levels[0];
    const badgeUrl = currentLevel?.badge || "images/levelBadges/level1.png";
    document.getElementById("levelBadge").src = badgeUrl;

    // 6️⃣ Update user points & level in Supabase
    await supabase.from("users").update({
      points: totalPoints,
      level: currentLevel?.name || "Level 1"
    }).eq("id", user.id);

    // 7️⃣ Render Category Summary Cards
    const categorySummaryDiv = document.getElementById("categorySummary");
    categorySummaryDiv.innerHTML = "";
    categories.forEach(cat => {
      const c = categorySummary[cat];
      categorySummaryDiv.innerHTML += `
        <div class="category-card">
          <img src="${categoryIcons[cat]}" alt="${cat}">
          <h3>${c.points} pts</h3>
          <p>${c.logs} logs</p>
        </div>`;
    });
    // Add total card
    categorySummaryDiv.innerHTML += `
      <div class="category-card total-card">
        <img src="${categoryIcons.all}" alt="All">
        <h3>${totalPoints} pts</h3>
        <p>${logs.length} logs</p>
      </div>`;

    // 8️⃣ Render Logs Table
    const logsTableBody = document.querySelector("#logsTable tbody");
    logsTableBody.innerHTML = logs.map(log => `
      <tr>
        <td><img src="${categoryIcons[log.category] || categoryIcons.all}" style="width:30px;height:30px"></td>
        <td>${new Date(log.date).toLocaleDateString()}</td>
        <td>${log.points}</td>
        <td>${log.notes || ""}</td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }
});
