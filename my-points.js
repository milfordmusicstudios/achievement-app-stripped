import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // DOM elements
  const logsTableBody = document.querySelector("#logsTable tbody");
  const categorySummary = document.getElementById("categorySummary");
  const levelBadge = document.getElementById("levelBadge");

  try {
    // Fetch logs, categories, and levels
    const [{ data: logs }, { data: categories }, { data: levels }] = await Promise.all([
      supabase.from("logs").select("*").eq("userId", user.id),
      supabase.from("categories").select("name, icon"),
      supabase.from("levels").select("*")
    ]);

    if (!logs) throw new Error("Failed to fetch logs.");

    // Map categories to icons
    const categoryIcons = {};
    categories.forEach(c => categoryIcons[c.name] = c.icon);

    // --- Calculate points ---
    let totalPoints = 0;
    const categoryTotals = {};
    logs.forEach(log => {
      totalPoints += log.points;
      if (!categoryTotals[log.category]) {
        categoryTotals[log.category] = { points: 0, logs: 0 };
      }
      categoryTotals[log.category].points += log.points;
      categoryTotals[log.category].logs++;
    });

    // --- Determine user level ---
    const currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) || levels[0];

    // --- Update user in Supabase ---
    await supabase.from("users").update({
      points: totalPoints,
      level: currentLevel.name
    }).eq("id", user.id);

    // --- Display Level Badge ---
    if (levelBadge) levelBadge.src = currentLevel.badge;

    // --- Render category summary cards ---
    categorySummary.innerHTML = "";
    categories.forEach(cat => {
      const totals = categoryTotals[cat.name] || { points: 0, logs: 0 };
      const card = document.createElement("div");
      card.className = "category-card";
      card.innerHTML = `
        <img src="${cat.icon}" alt="${cat.name}">
        <h3>${totals.points} pts</h3>
        <p>${totals.logs} logs</p>
      `;
      categorySummary.appendChild(card);
    });

    // Add All Categories card
    const totalCard = document.createElement("div");
    totalCard.className = "category-card total-card";
    totalCard.innerHTML = `
      <img src="images/categories/allCategories.png" alt="All">
      <h3>${totalPoints} pts</h3>
      <p>${logs.length} logs</p>
    `;
    categorySummary.appendChild(totalCard);

    // --- Render logs in table ---
    logsTableBody.innerHTML = "";
    logs.forEach((log, index) => {
      const row = document.createElement("tr");
      row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";
      row.innerHTML = `
        <td><img src="${categoryIcons[log.category] || 'images/categories/allCategories.png'}" style="width:40px;height:40px;"></td>
        <td>${new Date(log.date).toLocaleDateString()}</td>
        <td>${log.points}</td>
        <td>${log.notes || ""}</td>
      `;
      logsTableBody.appendChild(row);
    });

  } catch (err) {
    console.error("[ERROR] My Points:", err);
    alert("Failed to load points data.");
  }
});
