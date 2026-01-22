import { supabase } from "./supabaseClient.js";
import { getViewerContext, recalculateUserPoints } from './utils.js';
import { ensureStudioContextAndRoute } from "./studio-routing.js";

const categoryOptions = ["practice", "participation", "performance", "personal", "proficiency"];

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DEBUG] Review Logs: Script loaded");

  const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
  if (routeResult?.redirected) return;

  const user = JSON.parse(localStorage.getItem("loggedInUser") || "null");
  if (!user?.id) {
    window.location.href = "login.html";
    return;
  }

  const viewerContext = await getViewerContext();
  console.log("[AuthZ]", { page: "review-logs", roles: viewerContext.viewerRoles, studioId: viewerContext.studioId });
  if (!viewerContext.isAdmin && !viewerContext.isTeacher) {
    alert("Access denied.");
    window.location.href = "index.html";
    return;
  }
  const activeRole = viewerContext.isAdmin ? "admin" : "teacher";

  const roleBadge = document.getElementById("reviewRoleBadge");
  if (roleBadge instanceof HTMLImageElement) {
    if (activeRole === "admin") {
      roleBadge.src = "images/levelBadges/admin.png";
      roleBadge.alt = "Admin";
      roleBadge.style.display = "";
    } else if (activeRole === "teacher") {
      roleBadge.src = "images/levelBadges/teacher.png";
      roleBadge.alt = "Teacher";
      roleBadge.style.display = "";
    } else {
      roleBadge.style.display = "none";
    }
  }

  const logsTableBody = document.getElementById("logsTableBody");
  const categorySummary = document.getElementById("categorySummary");
  const searchInput = document.getElementById("searchInput");
  const bulkActionBar = document.getElementById("bulkActionBar");

  let allLogs = [];
  let users = [];
  let filteredLogs = [];
  let currentSort = { field: "date", order: "desc" };
  let currentPage = 1;
  let logsPerPage = 25;
  let activeCardFilter = "all";

  const todayString = () => new Date().toISOString().split("T")[0];
  const isApprovedStatus = (value) => String(value || "").toLowerCase() === "approved";
  const isSameDay = (value, today) => String(value || "").startsWith(today);
  const getApprovedTimestamp = (log) => log._approvedAtLocal || log.approved_at || log.updated_at || "";
  const isApprovedToday = (log, today) => {
    if (!isApprovedStatus(log.status)) return false;
    const approvedStamp = getApprovedTimestamp(log);
    return approvedStamp ? isSameDay(approvedStamp, today) : false;
  };

  try {
    const { data: logsData, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .order("date", { ascending: false });
    if (logsError) throw logsError;

    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, firstName, lastName, teacherIds");
    if (usersError) throw usersError;

    users = usersData || [];
    allLogs = (logsData || []).map(l => ({
      ...l,
      fullName:
        (users.find(u => String(u.id) === String(l.userId))?.firstName || "Unknown") +
        " " +
        (users.find(u => String(u.id) === String(l.userId))?.lastName || "")
    }));

  if (viewerContext.isTeacher && !viewerContext.isAdmin) {
    const myStudents = users
      .filter(u => Array.isArray(u.teacherIds) && u.teacherIds.map(String).includes(String(viewerContext.viewerUserId)))
      .map(s => String(s.id));
    allLogs = allLogs.filter(l => myStudents.includes(String(l.userId)));
  }

    applyFilters();
  } catch (err) {
    console.error("[ERROR] Review Logs:", err);
    alert("Failed to load logs.");
  }

  // Search + Card Filter
  searchInput.addEventListener("input", applyFilters);

  function applyFilters() {
    const searchVal = searchInput.value.toLowerCase();
    const todayStr = todayString();

    filteredLogs = allLogs.filter(l => {
      const matchesSearch =
        l.fullName.toLowerCase().includes(searchVal) ||
        (l.notes || "").toLowerCase().includes(searchVal) ||
        (l.category || "").toLowerCase().includes(searchVal);
      let matchesCard = true;
      if (activeCardFilter === "pending") {
        matchesCard = String(l.status || "").toLowerCase() === "pending";
      } else if (activeCardFilter === "approved-today") {
        matchesCard = isApprovedToday(l, todayStr);
      } else if (activeCardFilter === "needs info") {
        matchesCard = String(l.status || "").toLowerCase() === "needs info";
      }
      return matchesSearch && matchesCard;
    });

    currentPage = 1;
    sortLogs();
    renderCategorySummary(allLogs);
    renderLogsTable(filteredLogs);
  }

  // Column Sorting
  document.querySelectorAll("#logsHeaderTable th[data-sort]").forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) {
        currentSort.order = currentSort.order === "asc" ? "desc" : "asc";
      } else {
        currentSort.field = field;
        currentSort.order = "asc";
      }
      sortLogs();
      renderLogsTable(filteredLogs);
    });
  });

  function sortLogs() {
    filteredLogs.sort((a, b) => {
      let aVal = a[currentSort.field] || "";
      let bVal = b[currentSort.field] || "";

      if (currentSort.field === "date") {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }
      if (currentSort.field === "points") {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      }

      return currentSort.order === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  }

  // Pagination
  document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderLogsTable(filteredLogs);
    }
  });

  document.getElementById("nextPageBtn").addEventListener("click", () => {
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderLogsTable(filteredLogs);
    }
  });

  document.getElementById("logsPerPage").addEventListener("change", e => {
    logsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderLogsTable(filteredLogs);
  });

  function renderCategorySummary(list) {
    if (!categorySummary) return;
    const pendingCount = list.filter(l => String(l.status || "").toLowerCase() === "pending").length;
    const todayStr = todayString();
    const approvedTodayCount = list.filter(l => isApprovedToday(l, todayStr)).length;
    const needsInfoCount = list.filter(l => String(l.status || "").toLowerCase() === "needs info").length;

    const cards = [
      { label: "Pending Logs", value: pendingCount },
      { label: "Approved Today", value: approvedTodayCount },
      { label: "Needs Info", value: needsInfoCount },
      { label: "Total Logs", value: list.length }
    ];

    categorySummary.innerHTML = cards.map(card => {
      const key = card.label.toLowerCase();
      let extraClass = "";
      let filterTag = "all";
      if (key.includes("pending")) {
        extraClass = "pending";
        filterTag = "pending";
      } else if (key.includes("approved")) {
        extraClass = "approved";
        filterTag = "approved-today";
      } else if (key.includes("total")) {
        extraClass = "total";
        filterTag = "all";
      } else if (key.includes("needs info")) {
        extraClass = "review";
        filterTag = "needs info";
      } else {
        extraClass = "review";
      }
      return `
      <div class="summary-card ${extraClass} ${activeCardFilter === filterTag ? "is-active" : ""}" data-filter="${filterTag}">
        <div class="summary-label">${card.label}</div>
        <div class="summary-value">${card.value}</div>
      </div>
    `;
    }).join("");

    categorySummary.querySelectorAll(".summary-card").forEach(card => {
      card.addEventListener("click", () => {
        const filter = card.dataset.filter || "all";
        activeCardFilter = filter;
        applyFilters();
      });
    });
  }

  function renderLogsTable(list) {
    logsTableBody.innerHTML = "";
    const start = (currentPage - 1) * logsPerPage;
    const end = start + logsPerPage;
    const pageLogs = list.slice(start, end);

    pageLogs.forEach((log, index) => {
      const row = document.createElement("tr");
      row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";
      const categoryKey = String(log.category || "").toLowerCase();
      row.innerHTML = `
        <td><span class="cat-indicator" data-category="${categoryKey}"></span><input type="checkbox" class="select-log" data-id="${log.id}"></td>
        <td>${log.fullName}</td>
        <td>
          <select class="edit-input" data-id="${log.id}" data-field="category">
            ${categoryOptions.map(c =>
              `<option value="${c}" ${log.category?.toLowerCase() === c ? "selected" : ""}>${c}</option>`
            ).join("")}
          </select>
        </td>
        <td><input type="date" class="edit-input" data-id="${log.id}" data-field="date" value="${(log.date || '').split('T')[0] || ''}"></td>
        <td><input type="number" class="edit-input" data-id="${log.id}" data-field="points" value="${log.points ?? 0}"></td>
        <td><textarea class="edit-input" data-id="${log.id}" data-field="notes">${log.notes || ""}</textarea></td>
        <td>
          <select class="edit-input status-select status-pill" data-id="${log.id}" data-field="status" data-status="${String(log.status || "pending").toLowerCase()}">
            <option value="pending" ${log.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="approved" ${log.status === "approved" ? "selected" : ""}>Approved</option>
            <option value="rejected" ${log.status === "rejected" ? "selected" : ""}>Rejected</option>
            <option value="needs info" ${log.status === "needs info" ? "selected" : ""}>Needs Info</option>
          </select>
        </td>`;
      logsTableBody.appendChild(row);
    });

    document.getElementById("selectAll").checked = false;
    applyEditListeners();
    updateBulkActionBarVisibility();
  }

  function updateBulkActionBarVisibility() {
    if (!bulkActionBar) return;
    const selectedCount = document.querySelectorAll("#logsTableBody .select-log:checked").length;
    bulkActionBar.style.display = selectedCount > 0 ? "flex" : "none";
  }

  function applyEditListeners() {
    document.querySelectorAll(".edit-input").forEach(el => {
      if (el.tagName.toLowerCase() === "textarea") {
        el.addEventListener("input", () => {
          el.style.height = "auto";
          el.style.height = el.scrollHeight + "px";
        });
      }

      el.addEventListener("change", async e => {
        const logId = e.target.dataset.id;
        const field = e.target.dataset.field;
        let value = e.target.value;

        // Normalize values
        if (field === "points") value = parseInt(value) || 0;
        if (field === "category") value = String(value).toLowerCase();

        const { error } = await supabase.from("logs").update({ [field]: value }).eq("id", logId);
        if (error) {
          alert("Failed to update log.");
          console.error(error);
          return;
        }

        if (field === "status" && e.target instanceof HTMLSelectElement) {
          const statusValue = String(value || "").toLowerCase();
          e.target.dataset.status = statusValue;
        }
        console.log(`[DEBUG] Updated log ${logId}: ${field} = ${value}`);

        // Find the affected log to know which user to recalc
        const updated = allLogs.find(l => String(l.id) === String(logId));
        if (!updated) return;

        // Keep our local copy in sync
        updated[field] = value;

        // If the log is now approved, or points changed while approved, recalc that student
        const nowApproved = field === "status" && String(value).toLowerCase() === "approved";
        const pointsChangedWhileApproved = field === "points" && String(updated.status).toLowerCase() === "approved";

        if (nowApproved) {
          updated._approvedAtLocal = new Date().toISOString();
          updated.updated_at = updated._approvedAtLocal;
        }

        if (nowApproved || pointsChangedWhileApproved) {
          try {
            await recalculateUserPoints(String(updated.userId));
          } catch (recalcErr) {
            console.error("[ERROR] recalculateUserPoints:", recalcErr);
          }
        }
        applyFilters();
      });
    });
  }

  // Delete selected logs
  document.getElementById("deleteSelectedBtn").addEventListener("click", async () => {
    const selectedIds = Array.from(document.querySelectorAll(".select-log:checked"))
      .map(cb => String(cb.dataset.id).trim());

    if (selectedIds.length === 0) {
      alert("No logs selected.");
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} logs? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase.from("logs").delete().in("id", selectedIds);
      if (error) {
        console.error("[DELETE ERROR]", error);
        alert("❌ Failed to delete logs: " + error.message);
        return;
      }

      // Remove from local arrays
      allLogs = allLogs.filter(l => !selectedIds.includes(String(l.id)));
      applyFilters();
      updateBulkActionBarVisibility();
      alert("✅ Selected logs deleted successfully.");
    } catch (err) {
      console.error("Delete logs failed:", err);
      alert("❌ Failed to delete logs.");
    }
    });

  document.getElementById("bulkApproveBtn").addEventListener("click", async () => {
    const selectedIds = Array.from(document.querySelectorAll(".select-log:checked"))
      .map(cb => String(cb.dataset.id).trim())
      .filter(Boolean);

    if (selectedIds.length === 0) {
      alert("No logs selected.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("logs")
        .update({ status: "approved" })
        .in("id", selectedIds);

      if (error) {
        console.error("[APPROVE ERROR]", error);
        alert("Failed to approve logs: " + error.message);
        return;
      }

      console.log("[Approve Selected] updated", selectedIds.length, data);

      const approvedStamp = new Date().toISOString();
      allLogs = allLogs.map(l => selectedIds.includes(String(l.id))
        ? { ...l, status: "approved", _approvedAtLocal: approvedStamp, updated_at: approvedStamp }
        : l);
      applyFilters();
      updateBulkActionBarVisibility();
    } catch (err) {
      console.error("Approve logs failed:", err);
      alert("Failed to approve logs.");
    }
  });

// ✅ Select All Checkbox
document.getElementById("selectAll").addEventListener("change", (e) => {
  const isChecked = e.target.checked;
  document.querySelectorAll("#logsTableBody .select-log").forEach(cb => {
    cb.checked = isChecked;
  });
  updateBulkActionBarVisibility();
});

logsTableBody.addEventListener("change", (e) => {
  if (e.target.classList.contains("select-log")) {
    updateBulkActionBarVisibility();
  }
});

// === Notifications Tab Integration ===
const showLogsBtn = document.getElementById("showLogsBtn");
const showNotificationsBtn = document.getElementById("showNotificationsBtn");
const logsWrapper = document.getElementById("logsWrapper");
const notificationsSection = document.getElementById("notificationsSection");

if (showLogsBtn && showNotificationsBtn) {
  showLogsBtn.addEventListener("click", () => {
    logsWrapper.style.display = "block";
    notificationsSection.style.display = "none";
  });

  showNotificationsBtn.addEventListener("click", async () => {
    logsWrapper.style.display = "none";
    notificationsSection.style.display = "block";
    await loadNotifications();
  });
}

async function loadNotifications() {
  notificationsSection.innerHTML = "<p>Loading notifications...</p>";

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("created_at, message")
    .order("created_at", { ascending: false });

  console.log("[DEBUG] Notifications fetched:", notifications, error);

  if (error) {
    notificationsSection.innerHTML = `<p>Error loading notifications: ${error.message}</p>`;
    return;
  }

  if (!notifications || notifications.length === 0) {
    notificationsSection.innerHTML = "<p>No notifications yet.</p>";
    return;
  }

  const list = document.createElement("ul");
  list.style.listStyle = "none";
  list.style.padding = "0";

  notifications.forEach(n => {
    const li = document.createElement("li");
    li.style = "padding: 10px; border-bottom: 1px solid #ccc;";
    li.innerHTML = `
      <b>${new Date(n.created_at).toLocaleString()}</b><br>
      ${n.message}
    `;
    list.appendChild(li);
  });

  notificationsSection.innerHTML = "";
  notificationsSection.appendChild(list);
}
// === QUICK ADD MODAL ===
const quickAddBtn = document.getElementById("quickAddBtn");
const quickAddModal = document.getElementById("quickAddModal");
const quickAddCancel = document.getElementById("quickAddCancel");
const quickAddSubmit = document.getElementById("quickAddSubmit");

const quickAddStudentsList = document.getElementById("quickAddStudentsList");
const quickAddCategory = document.getElementById("quickAddCategory");
const quickAddDate = document.getElementById("quickAddDate");
const quickAddPoints = document.getElementById("quickAddPoints");
const quickAddNotes = document.getElementById("quickAddNotes");

if (quickAddBtn) {
  quickAddBtn.addEventListener("click", async () => {
    quickAddModal.style.display = "flex";
    await loadQuickAddStudents();
    // Default date = today
    quickAddDate.value = new Date().toISOString().split("T")[0];
  });
}

if (quickAddCancel) {
  quickAddCancel.addEventListener("click", () => {
    quickAddModal.style.display = "none";
  });
}

async function loadQuickAddStudents() {
  quickAddStudentsList.innerHTML = "<p>Loading students...</p>";

  const viewerContext = await getViewerContext();

  const { data: students, error } = await supabase
    .from("users")
    .select("id, firstName, lastName, roles, teacherIds");

  if (error) {
    quickAddStudentsList.innerHTML = `<p>Error: ${error.message}</p>`;
    return;
  }

  let filtered = students.filter(s => {
    const roles = Array.isArray(s.roles) ? s.roles : [s.roles];
    const isStudent = roles.includes("student");
    if (viewerContext.isAdmin) return isStudent;
    if (viewerContext.isTeacher)
      return isStudent && Array.isArray(s.teacherIds) && s.teacherIds.includes(viewerContext.viewerUserId);
    return false;
  });

  filtered = filtered.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  quickAddStudentsList.innerHTML = filtered
    .map(s => `
      <label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" class="quickAddStudent" value="${s.id}">
        ${s.firstName} ${s.lastName}
      </label>
    `)
    .join("");
}

if (quickAddSubmit) {
  quickAddSubmit.addEventListener("click", async () => {
    const selectedIds = Array.from(document.querySelectorAll(".quickAddStudent:checked")).map(cb => cb.value);
    const category = quickAddCategory.value;
    const date = quickAddDate.value;
    const points = quickAddPoints.value ? parseInt(quickAddPoints.value) : (category === "practice" ? 5 : 0);
    const notes = quickAddNotes.value.trim();

    if (selectedIds.length === 0) return alert("Select at least one student.");
    if (!category || !date) return alert("Please select a category and date.");

    const inserts = selectedIds.map(id => ({
      userId: id,
      category,
      notes,
      date,
      points,
      status: "approved"
    }));

    const { error } = await supabase.from("logs").insert(inserts);
    if (error) {
      console.error("Quick Add failed:", error);
      alert("Error adding logs.");
      return;
    }

    // Recalculate each selected student's points
    for (const id of selectedIds) {
      try {
        await recalculateUserPoints(id);
      } catch (err) {
        console.error("Recalc error:", err);
      }
    }

    alert(`✅ Points added for ${selectedIds.length} student(s)!`);
    quickAddModal.style.display = "none";
    await new Promise(r => setTimeout(r, 300)); // short delay for backend sync
    location.reload(); // refresh logs
  });
}

  });
