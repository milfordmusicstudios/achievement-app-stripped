import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  const logsTable = document.querySelector("#logsTable tbody");
  const categorySummary = document.getElementById("categorySummary");
  const levelBadge = document.getElementById("levelBadge");

  const categoryIcons = {
    practice: "images/categories/practice.png",
    participation: "images/categories/participation.png",
    performance: "images/categories/performance.png",
    personal: "images/categories/personal.png",
    proficiency: "images/categories/proficiency.png",
    total: "images/categories/allCategories.png"
  };

  try {
    // Fetch logs for this user
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", user.id)
      .order("date", { ascending: false });

    if (logsError) throw logsError;
    if (!logs || logs.length === 0) {
      logsTable.innerHTML = `<tr><td colspan="4">No logs found.</td></tr>`;
      return;
    }

    // Group points by category
    const categories = ["practice", "participation", "performance", "personal", "proficiency"];
    const categoryTotals = {};
    categories.forEach(cat => categoryTotals[cat] = { points: 0, count: 0 });

    let totalPoints = 0;
    logs.forEach(log => {
      if (categoryTotals[log.category]) {
        categoryTotals[log.category].points += log.points;
        categoryTotals[log.category].count++;
      }
      totalPoints += log.points;
    });

    // Render category summary cards
    categorySummary.innerHTML = "";
    categories.forEach(cat => {
      const card = document.createElement("div");
      card.className = "category-card";
      card.innerHTML = `
        <img src="${categoryIcons[cat]}" alt="${cat}">
        <h3>${categoryTotals[cat].points} pts</h3>
        <p>${categoryTotals[cat].count} logs</p>`;
      categorySummary.appendChild(card);
    });

    // Add total card
    const totalCard = document.createElement("div");
    totalCard.className = "category-card total-card";
    totalCard.innerHTML = `
      <img src="${categoryIcons.total}" alt="Total">
      <h3>${totalPoints} pts</h3>
      <p>${logs.length} logs</p>`;
    categorySummary.appendChild(totalCard);

    // Render log table
    logsTable.innerHTML = "";
    logs.forEach((log, idx) => {
      const row = document.createElement("tr");
      row.className = idx % 2 === 0 ? "log-row-even" : "log-row-odd";
      row.innerHTML = `
        <td><img src="${categoryIcons[log.category] || categoryIcons.total}" style="width:30px;height:30px;"></td>
        <td>${new Date(log.date).toLocaleDateString()}</td>
        <td>${log.points}</td>
        <td>${log.notes || ""}</td>`;
      logsTable.appendChild(row);
    });

    // Calculate level from points
    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("*");
    if (levelsError) throw levelsError;

    let userLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!userLevel) userLevel = levels[0]; // default to first level if none match

    // Update user points & level in Supabase
    await supabase.from("users").update({
      points: totalPoints,
      level: userLevel.id
    }).eq("id", user.id);

    // Display level badge
    levelBadge.src = userLevel.badge || "images/levelBadges/level1.png";
  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }
});
