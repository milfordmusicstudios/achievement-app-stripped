import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  const logsSection = document.getElementById("logsTableBody");
  const categorySummary = document.getElementById("categorySummary");

  // Define categories and icons
  const categories = {
    performance: "images/categories/performance.png",
    participation: "images/categories/participation.png",
    practice: "images/categories/practice.png",
    personal: "images/categories/personal.png",
    proficiency: "images/categories/proficiency.png",
    total: "images/categories/allCategories.png"
  };
// Fetch user level badge (similar to home.js)
const badgeEl = document.getElementById("levelBadge");

// Fetch user data to get badge
const { data: userData, error: userError } = await supabase
  .from("users")
  .select("level")
  .eq("id", user.id)
  .single();

if (!userError && userData) {
  badgeEl.src = `images/levelBadges/level${userData.level || 1}.png`;
}

  // Fetch logs for this user
  const { data: logs, error } = await supabase
    .from("logs")
    .select("*")
    .eq("userId", user.id)
    .order("date", { ascending: false });

  if (error) {
    console.error("Error fetching logs:", error);
    return;
  }

  // Build category totals
  const categoryData = {
    performance: { points: 0, count: 0 },
    participation: { points: 0, count: 0 },
    practice: { points: 0, count: 0 },
    personal: { points: 0, count: 0 },
    proficiency: { points: 0, count: 0 },
    total: { points: 0, count: 0 }
  };

  logs.forEach(log => {
    const cat = log.category?.toLowerCase();
    if (categoryData[cat]) {
      categoryData[cat].points += log.points;
      categoryData[cat].count++;
    }
    categoryData.total.points += log.points;
    categoryData.total.count++;
  });

  // Render category summary cards
  categorySummary.innerHTML = "";
  Object.keys(categories).forEach(cat => {
    const card = document.createElement("div");
    card.className = `category-card ${cat === "total" ? "total-card" : ""}`;
    card.innerHTML = `
      <img src="${categories[cat]}" alt="${cat}" style="width:50px;height:50px;">
      <h3>${categoryData[cat].points} pts</h3>
      <p>${categoryData[cat].count} logs</p>
    `;
    categorySummary.appendChild(card);
  });

  // Render logs table
  logsSection.innerHTML = "";
  logs.forEach((log, idx) => {
    const row = document.createElement("tr");
    row.className = idx % 2 === 0 ? "log-row-even" : "log-row-odd";
    const icon = categories[log.category?.toLowerCase()] || categories.total;

row.innerHTML = `
  <td><img src="${categoryIcons[log.category] || categoryIcons['all']}" alt="${log.category}" style="width:35px;height:35px;"></td>
  <td>${new Date(log.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}</td>
  <td>${log.points}</td>
  <td>${log.notes || ''}</td>
`;
    logsSection.appendChild(row);
  });
});
