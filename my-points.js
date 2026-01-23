import { supabase } from "./supabaseClient.js";
import { getViewerContext } from './utils.js';
import { ensureStudioContextAndRoute } from "./studio-routing.js";

function getLastToastLevel(userId) {
  const key = `aa:lastLevelToast:${String(userId)}`;
  const raw = localStorage.getItem(key);
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function setLastToastLevel(userId, level) {
  if (!Number.isFinite(level)) return;
  const key = `aa:lastLevelToast:${String(userId)}`;
  localStorage.setItem(key, String(level));
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

async function createLevelUpNotifications({ studioId, studentUserId, studentName, level }) {
  if (!studentUserId || !level) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const viewerId = sessionData?.session?.user?.id || null;

    const { data: members, error: memberErr } = await supabase
      .from("studio_members")
      .select("user_id, roles")
      .eq("studio_id", studioId)
      .or("roles.cs.{admin},roles.cs.{teacher}");

    if (memberErr) console.warn("[My Points] staff lookup failed", memberErr);

    const staffIds = Array.from(new Set((members || []).map(m => m.user_id).filter(Boolean)));
    const recipients = [studentUserId, ...staffIds];
    const message = `${studentName} reached Level ${level}.`;
    const base = {
      title: "Level Up!",
      message,
      type: "level_up",
      studio_id: studioId || null,
      created_by: viewerId
    };

    const extendedPayload = recipients.map(userId => ({
      userId,
      ...base
    }));

    let insertError = null;
    const { error: extErr } = await supabase.from("notifications").insert(extendedPayload);
    if (extErr) {
      insertError = extErr;
      const msg = String(extErr.message || "");
      if (msg.toLowerCase().includes("column") || msg.toLowerCase().includes("does not exist")) {
        const fallbackPayload = recipients.map(userId => ({
          userId,
          message
        }));
        const { error: fallbackErr } = await supabase.from("notifications").insert(fallbackPayload);
        if (fallbackErr) insertError = fallbackErr;
        else insertError = null;
      }
    }

    if (insertError) {
      console.warn("[My Points] level-up notification insert failed", insertError);
    }
  } catch (err) {
    console.warn("[My Points] level-up notifications error", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DEBUG] My Points: Script loaded");

  const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
  if (routeResult?.redirected) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    window.location.href = "login.html";
    return;
  }

  const viewerContext = await getViewerContext();
  console.log("[Identity] viewer context", viewerContext);
  let activeStudentId = null;
  if (viewerContext.mode === "student") {
    activeStudentId = viewerContext.activeProfileId || viewerContext.viewerUserId;
  } else if (viewerContext.mode === "parent") {
    const key = viewerContext.studioId && viewerContext.viewerUserId
      ? `aa.activeStudent.${viewerContext.studioId}.${viewerContext.viewerUserId}`
      : null;
    activeStudentId = (key && localStorage.getItem(key)) || null;
  }
  if (!activeStudentId) {
    alert("Select a student on Home to view points.");
    window.location.href = "index.html";
    return;
  }

  const userId = activeStudentId;
  console.log("[DEBUG] Fetching logs for user ID:", userId);

  const logsTableBody = document.getElementById("logsTableBody");
  const categorySummary = document.getElementById("categorySummary");
  const pointsTitle = document.getElementById("pointsTitle");
  const levelBadge = document.getElementById("levelBadge");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");

  let allLogs = [];
  let filteredLogs = [];

  try {
    // ✅ Fetch logs
    console.log("[My Points] fetching logs for userId", userId);
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", userId)
      .order("date", { ascending: false });

    if (logsError) throw logsError;
    console.log("[DEBUG] Logs fetched:", logs);
    if (!logs || logs.length === 0) {
      console.log("[My Points] empty logs", {
        activeStudentId: userId,
        roles: viewerContext.roles,
        studioId: viewerContext.studioId
      });
    }

    const { data: approvedLogs, error: approvedErr } = await supabase
      .from("logs")
      .select("points")
      .eq("userId", userId)
      .eq("status", "approved");
    if (approvedErr) throw approvedErr;

    const totalPoints = (approvedLogs || []).reduce((sum, log) => sum + (log.points || 0), 0);
    console.log("[DEBUG] Total approved points:", totalPoints);

    const { data: levels, error: levelsErr } = await supabase
      .from("levels")
      .select("*")
      .order("minPoints", { ascending: true });
    if (levelsErr) throw levelsErr;

    const currentLevel =
      (levels || []).find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints)
      || (levels || [])[levels?.length - 1]
      || null;

    if (levelBadge) {
      levelBadge.src = currentLevel?.badge || "images/levelBadges/level1.png";
    }

    const { data: profileRow } = await supabase
      .from("users")
      .select("firstName, lastName")
      .eq("id", userId)
      .single();
    const firstName = profileRow?.firstName || "";
    const studentName = `${profileRow?.firstName || ""} ${profileRow?.lastName || ""}`.trim() || "Student";
    if (pointsTitle) {
      pointsTitle.textContent = firstName ? `${firstName}'s Points` : "My Points";
    }

    const currentLevelNumber = Number(currentLevel?.id || currentLevel?.name);
    const storedLevel = getLastToastLevel(userId);
    if (Number.isFinite(currentLevelNumber)) {
      if (storedLevel === null) {
        setLastToastLevel(userId, currentLevelNumber);
      } else if (currentLevelNumber > storedLevel) {
        showToast(`🎉 You reached Level ${currentLevelNumber}!`);
        setLastToastLevel(userId, currentLevelNumber);
        await createLevelUpNotifications({
          studioId: viewerContext.studioId || localStorage.getItem("activeStudioId"),
          studentUserId: userId,
          studentName,
          level: currentLevelNumber
        });
      }
    }

    allLogs = (logs || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    renderCategorySummary(allLogs);
    applyFilters();

  } catch (err) {
    console.error("[ERROR] My Points:", err);
  }

  // ---- FUNCTIONS ----
  function renderCategorySummary(logs) {
    categorySummary.innerHTML = "";
    const categories = [
      { key: "practice", label: "Practice" },
      { key: "participation", label: "Participation" },
      { key: "performance", label: "Performance" },
      { key: "personal", label: "Personal" },
      { key: "proficiency", label: "Proficiency" }
    ];

    const categoryIconMap = {
      practice: "images/categories/practice.png",
      participation: "images/categories/participation.png",
      performance: "images/categories/performance.png",
      personal: "images/categories/personal.png",
      proficiency: "images/categories/proficiency.png"
    };

    const summary = {};
    logs.forEach(l => {
      const cat = String(l.category || "").toLowerCase();
      if (!summary[cat]) summary[cat] = { approvedPoints: 0, approvedCount: 0, pendingPoints: 0, pendingCount: 0 };
      const isApproved = String(l.status || "").toLowerCase() === "approved";
      if (isApproved) {
        summary[cat].approvedPoints += l.points || 0;
        summary[cat].approvedCount += 1;
      } else {
        summary[cat].pendingPoints += l.points || 0;
        summary[cat].pendingCount += 1;
      }
    });

    categorySummary.innerHTML = categories.map(cat => {
      const data = summary[cat.key] || { approvedPoints: 0, approvedCount: 0, pendingPoints: 0, pendingCount: 0 };
      const icon = categoryIconMap[cat.key] || "images/categories/allCategories.png";
      return `
        <div class="summary-card category-card">
          <img class="category-icon" src="${icon}" alt="${cat.label}">
          <div class="summary-label">${cat.label}</div>
          <div class="summary-value">${data.approvedPoints} pts</div>
          <div class="summary-sub">
            ${data.approvedCount} logs • Pending ${data.pendingCount}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderLogs(logs) {
    logsTableBody.innerHTML = "";
    logs.forEach((log, index) => {
      const icon = `images/categories/${(log.category || "allCategories").toLowerCase()}.png`;
      const status = String(log.status || "pending");
      const rowClass = `${index % 2 === 0 ? 'log-row-even' : 'log-row-odd'} ${status.toLowerCase() === "pending" ? "row-pending" : ""}`;
      logsTableBody.innerHTML += `
        <tr class="${rowClass}">
          <td><img src="${icon}" style="width:30px;height:30px"></td>
          <td>${log.date ? new Date(log.date).toLocaleDateString() : ""}</td>
          <td>${log.points ?? ""}</td>
          <td>${log.notes || ""}</td>
          <td><span class="status-pill status-${status.toLowerCase().replace(" ", "-")}">${status}</span></td>
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

  function applyFilters() {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const status = statusFilter?.value || "all";

    filteredLogs = allLogs.filter(log => {
      const matchesStatus = status === "all"
        ? true
        : String(log.status || "").toLowerCase() === status;
      const haystack = [
        log.category,
        log.notes,
        log.status,
        log.date ? new Date(log.date).toLocaleDateString() : ""
      ].join(" ").toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesStatus && matchesQuery;
    });

    renderLogs(filteredLogs);
  }

  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (statusFilter) statusFilter.addEventListener("change", applyFilters);

  new ResizeObserver(syncHeaderWidths).observe(document.querySelector("#logsTable"));
});
