import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DEBUG] My Points: Script loaded");

  // ✅ Validate user
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user || !user.id) {
    console.error("[ERROR] Logged in user missing or malformed:", user);
    alert("User session not found. Please log in again.");
    window.location.href = "login.html";
    return;
  }

  const userId = user.id;

  // ✅ Get DOM elements safely
  const logsTable = document.getElementById("logsTableBody");
  const categorySummary = document.getElementById("categorySummary");
  const badgeImg = document.getElementById("levelBadge");

  if (!logsTable || !categorySummary || !badgeImg) {
    console.error("[ERROR] Missing essential DOM elements.");
    return;
  }

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

    // ✅ Category icons map
    const categoryIcons = {
      performance: "images/categories/performance.png",
      participation: "images/categories/participation.png",
      practice: "images/categories/practice.png",
      personal: "images/categories/personal.png",
      proficiency: "images/categories/proficiency.png",
      all: "images/categories/allCategories.png",
    };

    // ✅ Calculate totals by category
    const categoryTotals = {
      performance: { points: 0, logs: 0 },
      participation: { points: 0, logs: 0 },
      practice: { points: 0, logs: 0 },
      personal: { points: 0, logs: 0 },
      proficiency: { points: 0, logs: 0 }
    };

    let totalPoints = 0;
    logs.forEach(log => {
      const cat = log.category?.toLowerCase() || "unknown";
      totalPoints += log.points || 0;
      if (categoryTotals[cat]) {
        categoryTotals[cat].points += log.points || 0;
        categoryTotals[cat].logs += 1;
      }
    });

    // ✅ Render category summary cards
    categorySummary.innerHTML = "";
    Object.keys(categoryTotals).forEach(cat => {
      const c = categoryTotals[cat];
      const card = document.createElement("div");
      card.className = "category-card";
      card.innerHTML = `
        <img src="${categoryIcons[cat]}" alt="${cat}">
        <h3>${c.points} pts</h3>
        <p>${c.logs} logs</p>`;
      categorySummary.appendChild(card);
    });

    // ✅ Add total card
    const totalCard = document.createElement("div");
    totalCard.className = "category-card total-card";
    totalCard.innerHTML = `
      <img src="${categoryIcons.all}" alt="Total">
      <h3>${totalPoints} pts</h3>
      <p>${logs.length} logs</p>`;
    categorySummary.appendChild(totalCard);

    // ✅ Determine user's level based on min/max range
    let userLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!userLevel) userLevel = levels[0]; // fallback to level 1
    console.log("[DEBUG] User Level determined:", userLevel);

    // ✅ Update user points & level in Supabase
    const { error: updateError } = await supabase
      .from("users")
      .update({ points: totalPoints, level: userLevel.id })
      .eq("id", userId);

    if (updateError) console.error("[ERROR] Failed to update user:", updateError);
    else console.log("[DEBUG] User points & level updated in Supabase");

    // ✅ Display level badge (fallback to level1.png if missing)
    badgeImg.src = userLevel?.badge || "images/levelBadges/level1.png";

    // ✅ Render logs in table
    logsTable.innerHTML = "";
    logs.forEach((log, index) => {
      const row = document.createElement("tr");
      row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";
      row.innerHTML = `
        <td><img src="${categoryIcons[log.category?.toLowerCase()] || categoryIcons.all}" style="width:30px;height:30px;"></td>
        <td>${new Date(log.date).toLocaleDateString()}</td>
        <td>${log.points}</td>
        <td>${log.notes || ""}</td>`;
      logsTable.appendChild(row);
    });

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }
});
