import { supabase } from "./supabase.js";

const categoryIcons = {
  performance: "images/categories/performance.png",
  participation: "images/categories/participation.png",
  practice: "images/categories/practice.png",
  personal: "images/categories/personal.png",
  proficiency: "images/categories/proficiency.png",
  all: "images/categories/allCategories.png"
};

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // Fetch logs for this user
  const { data: logs, error } = await supabase
    .from("logs")
    .select("*")
    .eq("userId", user.id)
    .order("date", { ascending: false });

  if (error) {
    console.error("[ERROR] Fetching logs:", error);
    return;
  }

  renderLogs(logs);
  renderCategorySummary(logs);
});

// ✅ Render logs with properly sized category icons
function renderLogs(logs) {
  const logTableBody = document.getElementById("logsTableBody");
  if (!logTableBody) {
    console.error("[ERROR] logsTableBody not found in DOM");
    return;
  }

  logTableBody.innerHTML = "";
  logs.forEach((log, index) => {
    const row = document.createElement("tr");
    row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";

    const iconPath = categoryIcons[log.category?.toLowerCase()] || categoryIcons.all;

    row.innerHTML = `
      <td>${new Date(log.date).toLocaleDateString()}</td>
      <td><img src="${iconPath}" alt="${log.category}" class="log-icon"></td>
      <td>${log.points}</td>
      <td>${log.note || ""}</td>
    `;
    logTableBody.appendChild(row);
  });
}

// ✅ Render category summary cards
function renderCategorySummary(logs) {
  const categories = ["performance", "participation", "practice", "personal", "proficiency"];
  const summaryContainer = document.getElementById("categorySummary");
  summaryContainer.innerHTML = "";

  const totalPoints = logs.reduce((sum, l) => sum + (l.points || 0), 0);
  const totalLogs = logs.length;

  categories.forEach(cat => {
    const catLogs = logs.filter(l => l.category?.toLowerCase() === cat);
    const catPoints = catLogs.reduce((sum, l) => sum + (l.points || 0), 0);

    summaryContainer.innerHTML += `
      <div class="summary-card">
        <img src="${categoryIcons[cat]}" alt="${cat}" class="summary-icon">
        <h3>${catPoints} pts</h3>
        <p>${catLogs.length} logs</p>
      </div>
    `;
  });

  summaryContainer.innerHTML += `
    <div class="summary-card total">
      <img src="${categoryIcons.all}" alt="Total" class="summary-icon">
      <h3>${totalPoints} pts</h3>
      <p>${totalLogs} logs</p>
    </div>
  `;
}
