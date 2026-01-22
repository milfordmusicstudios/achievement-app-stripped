import { supabase } from "./supabaseClient.js";
import { getActiveStudentId, recalculateUserPoints } from './utils.js';
import { ensureStudioContextAndRoute } from "./studio-routing.js";

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DEBUG] My Points: Script loaded");

  const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
  if (routeResult?.redirected) return;

  const userId = await getActiveStudentId();
  if (!userId) {
    alert("User session not found. Please log in again.");
    window.location.href = "login.html";
    return;
  }

  console.log("[DEBUG] Fetching logs for user ID:", userId);

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
    if (!logs || logs.length === 0) {
      const rolesRaw = localStorage.getItem("activeStudioRoles");
      let roles = [];
      try {
        roles = JSON.parse(rolesRaw || "[]");
      } catch {
        roles = [];
      }
      console.log("[My Points] empty logs", {
        activeStudentId: userId,
        roles,
        studioId: localStorage.getItem("activeStudioId")
      });
    }

const { totalPoints, currentLevel } = await recalculateUserPoints(userId);
console.log("[DEBUG] Total approved points:", totalPoints);

levelBadge.src = currentLevel?.badge || "images/levelBadges/level1.png";
renderCategorySummary(logs.filter(l => l.status === "approved"), totalPoints);

    logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderLogs(logs);

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }

  // ---- FUNCTIONS ----
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
const icon = `images/categories/${(log.category || "allCategories").toLowerCase()}.png`;
      logsTableBody.innerHTML += `
        <tr class="${index % 2 === 0 ? 'log-row-even' : 'log-row-odd'}">
          <td><img src="${icon}" style="width:30px;height:30px"></td>
          <td>${log.date ? new Date(log.date).toLocaleDateString() : ""}</td>
          <td>${log.points ?? ""}</td>
          <td>${log.notes || ""}</td>
          <td>${log.status || "pending"}</td>
        </tr>`;
    });
  }

  function syncHeaderWidths() {
    const headerCells = document.querySelectorAll("#pointsHeaderTable th");
    const firstRowCells = document.querySelectorAll("#logsTable tr:first-child td");
    if (!firstRowCells.length) return;
    headerCells.forEach((th, i) => {
      if (firstRowCells[i]) {
        th.style.width = firstRowCells[i].offsetWidth + "px";
      }
    });
  }

  new ResizeObserver(syncHeaderWidths).observe(document.querySelector("#logsTable"));
});
