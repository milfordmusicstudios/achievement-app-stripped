import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  const logsTableBody = document.querySelector("#logsTableBody");
  const categorySummary = document.getElementById("categorySummary");
  const levelBadge = document.getElementById("levelBadge");

  try {
    const [{ data: logs }, { data: categories }, { data: levels }] = await Promise.all([
      supabase.from("logs").select("* ").eq("userId", user.id),
      supabase.from("categories").select("name, icon"),
      supabase.from("levels").select("*")
    ]);

    if (!logs) throw new Error("Failed to fetch logs.");

    // Build category icon map with safe fallback
    const categoryIcons = {};
    if (categories) {
      categories.forEach(c => categoryIcons[c.name] = c.icon || "images/categories/allCategories.png");
    }

    // Calculate totals
    let totalPoints = 0;
    const categoryTotals = {};
    logs.forEach(log => {
      totalPoints += log.points || 0;
      if (!categoryTotals[log.category]) categoryTotals[log.category] = { points: 0, logs: 0 };
      categoryTotals[log.category].points += log.points || 0;
      categoryTotals[log.category].logs++;
    });

    // Determine current level
    const currentLevel = levels?.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) || levels?.[0];

    // Update user points and level in Supabase
    if (currentLevel) {
      await supabase.from("users").update({ points: totalPoints, level: currentLevel.name }).eq("id", user.id);
      if (levelBadge) levelBadge.src = currentLevel.badge || "images/levelBadges/level1.png";
    }

    // Render category summary cards
    if (categorySummary) {
      categorySummary.innerHTML = "";
      (categories || []).forEach(cat => {
        const totals = categoryTotals[cat.name] || { points: 0, logs: 0 };
        const card = document.createElement("div");
        card.className = "category-card";
        card.innerHTML = `
          <img src="${cat.icon || 'images/categories/allCategories.png'}" alt="${cat.name}" style="width:50px;height:50px;">
          <h3>${totals.points} pts</h3>
          <p>${totals.logs} logs</p>`;
        categorySummary.appendChild(card);
      });
      const totalCard = document.createElement("div");
      totalCard.className = "category-card total-card";
      totalCard.innerHTML = `
        <img src="images/categories/allCategories.png" alt="All Categories" style="width:50px;height:50px;">
        <h3>${totalPoints} pts</h3>
        <p>${logs.length} logs</p>`;
      categorySummary.appendChild(totalCard);
    }

    // Render logs table
    if (logsTableBody) {
      logsTableBody.innerHTML = "";
      logs.forEach((log, index) => {
        const row = document.createElement("tr");
        row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";
        const icon = categoryIcons[log.category] || "images/categories/allCategories.png";
        row.innerHTML = `
          <td><img src="${icon}" alt="${log.category}" class="log-icon"></td>
          <td>${new Date(log.date).toLocaleDateString()}</td>
          <td>${log.points}</td>
          <td>${log.notes || ""}</td>`;
        logsTableBody.appendChild(row);
      });
    }

  } catch (err) {
    console.error("[ERROR] My Points:", err);
    alert("Failed to load points data.");
  }
});
