import { supabase } from "./supabaseClient.js";
import { recalculateUserPoints } from './utils.js';

const categoryOptions = ["practice", "participation", "performance", "personal", "proficiency"];

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DEBUG] Review Logs: Script loaded");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user || !["admin", "teacher"].includes(activeRole)) {
    alert("You are not authorized to view this page.");
    window.location.href = "index.html";
    return;
  }

  const logsTableBody = document.getElementById("logsTableBody");
  const categorySummary = document.getElementById("categorySummary");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");

  let logs = [];
  let users = [];
  let filteredLogs = [];
  let currentSort = { field: "date", order: "desc" };
  let currentPage = 1;
  let logsPerPage = 25;

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
    logs = (logsData || []).map(l => ({
      ...l,
      fullName:
        (users.find(u => String(u.id) === String(l.userId))?.firstName || "Unknown") +
        " " +
        (users.find(u => String(u.id) === String(l.userId))?.lastName || "")
    }));

    if (activeRole === "teacher") {
      const myStudents = users
        .filter(u => Array.isArray(u.teacherIds) && u.teacherIds.map(String).includes(String(user.id)))
        .map(s => String(s.id));
      logs = logs.filter(l => myStudents.includes(String(l.userId)));
    }

    filteredLogs = [...logs];
    renderCategorySummary(filteredLogs);
    renderLogsTable(filteredLogs);
  } catch (err) {
    console.error("[ERROR] Review Logs:", err);
    alert("Failed to load logs.");
  }

  // Search + Status Filter
  searchInput.addEventListener("input", applyFilters);
  statusFilter.addEventListener("change", applyFilters);

  function applyFilters() {
    const searchVal = searchInput.value.toLowerCase();
    const statusVal = statusFilter.value;

    filteredLogs = logs.filter(l => {
      const matchesSearch =
        l.fullName.toLowerCase().includes(searchVal) ||
        (l.notes || "").toLowerCase().includes(searchVal) ||
        (l.category || "").toLowerCase().includes(searchVal);
      const matchesStatus = !statusVal || (l.status && l.status.toLowerCase() === statusVal.toLowerCase());
      return matchesSearch && matchesStatus;
    });

    currentPage = 1;
    sortLogs();
    renderCategorySummary(filteredLogs);
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
    list.forEach(l => {
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
        <h3>${list.reduce((sum, l) => sum + (l.points || 0), 0)} pts</h3>
        <p>${list.length} logs</p>
      </div>`;
  }

  function renderLogsTable(list) {
    logsTableBody.innerHTML = "";
    const start = (currentPage - 1) * logsPerPage;
    const end = start + logsPerPage;
    const pageLogs = list.slice(start, end);

    pageLogs.forEach((log, index) => {
      const row = document.createElement("tr");
      row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";
      row.innerHTML = `
        <td><input type="checkbox" class="select-log" data-id="${log.id}"></td>
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
          <select class="edit-input" data-id="${log.id}" data-field="status">
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
        console.log(`[DEBUG] Updated log ${logId}: ${field} = ${value}`);

        // Find the affected log to know which user to recalc
        const updated = logs.find(l => String(l.id) === String(logId));
        if (!updated) return;

        // Keep our local copy in sync
        updated[field] = value;

        // If the log is now approved, or points changed while approved, recalc that student
        const nowApproved = field === "status" && String(value).toLowerCase() === "approved";
        const pointsChangedWhileApproved = field === "points" && String(updated.status).toLowerCase() === "approved";

        if (nowApproved || pointsChangedWhileApproved) {
          try {
            await recalculateUserPoints(String(updated.userId));
          } catch (recalcErr) {
            console.error("[ERROR] recalculateUserPoints:", recalcErr);
          }
        }
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
      logs = logs.filter(l => !selectedIds.includes(String(l.id)));
      filteredLogs = filteredLogs.filter(l => !selectedIds.includes(String(l.id)));

      renderLogsTable(filteredLogs);
      renderCategorySummary(filteredLogs);
      alert("✅ Selected logs deleted successfully.");
    } catch (err) {
      console.error("Delete logs failed:", err);
      alert("❌ Failed to delete logs.");
    }
  });

// ✅ Select All Checkbox
document.getElementById("selectAll").addEventListener("change", (e) => {
  const isChecked = e.target.checked;
  document.querySelectorAll("#logsTableBody .select-log").forEach(cb => {
    cb.checked = isChecked;
  });
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

const quickAddStudentSearch = document.getElementById("quickAddStudentSearch");
const quickAddStudentResults = document.getElementById("quickAddStudentResults");
const quickAddStudentChips = document.getElementById("quickAddStudentChips");
const quickAddCategory = document.getElementById("quickAddCategory");
const quickAddDate = document.getElementById("quickAddDate");
const quickAddDateBtn = document.getElementById("quickAddDateBtn");
const quickAddDateChips = document.getElementById("quickAddDateChips");
const quickAddPoints = document.getElementById("quickAddPoints");
const quickAddNotes = document.getElementById("quickAddNotes");
const quickAddClearBtn = document.getElementById("quickAddClearSearch");

let quickAddStudentPool = [];
const quickAddSelection = new Map();
const quickAddDates = new Set();

function formatStudentName(student) {
  if (!student) return "";
  const first = student.firstName || "";
  const last = student.lastName || "";
  const name = `${last}, ${first}`.trim();
  return name.length ? name : `${first} ${last}`.trim();
}

function renderQuickAddStudentResults() {
  if (!quickAddStudentResults) return;
  const query = (quickAddStudentSearch?.value || "").trim().toLowerCase();
  if (!query) {
    quickAddStudentResults.style.display = "none";
    return;
  }

  quickAddStudentResults.style.display = "block";

  if (!quickAddStudentPool.length) {
    quickAddStudentResults.innerHTML = `<div class="student-placeholder">Loading students...</div>`;
    return;
  }

  const matches = quickAddStudentPool.filter(student => {
    const full = `${student.firstName} ${student.lastName}`.trim().toLowerCase();
    const reversed = `${student.lastName}, ${student.firstName}`.trim().toLowerCase();
    return full.includes(query) || reversed.includes(query);
  });

  if (!matches.length) {
    quickAddStudentResults.innerHTML = `<div class="student-placeholder">No matches</div>`;
    return;
  }

  quickAddStudentResults.innerHTML = matches
    .map(student => {
      const name = formatStudentName(student);
      const isSelected = quickAddSelection.has(String(student.id));
      return `<div class="student-option ${isSelected ? "selected" : ""}" data-id="${student.id}">${name}</div>`;
    })
    .join("");
}

function updateQuickAddChips() {
  if (!quickAddStudentChips) return;
  if (!quickAddSelection.size) {
    quickAddStudentChips.innerHTML = "";
    return;
  }
  quickAddStudentChips.innerHTML = Array.from(quickAddSelection.values())
    .map(student => {
      const name = formatStudentName(student);
      return `
        <span class="student-chip">
          ${name}
          <button type="button" data-remove-student="${student.id}" aria-label="Remove ${name}">&times;</button>
        </span>`;
    })
    .join("");
}

function toggleQuickAddStudent(student) {
  if (!student) return;
  const key = String(student.id);
  if (quickAddSelection.has(key)) return;
  quickAddSelection.set(key, student);
  updateQuickAddChips();
  renderQuickAddStudentResults();
  if (quickAddStudentSearch) quickAddStudentSearch.value = "";
  if (quickAddStudentResults) quickAddStudentResults.style.display = "none";
}

function resetQuickAddSelection() {
  quickAddSelection.clear();
  if (quickAddStudentSearch) quickAddStudentSearch.value = "";
  updateQuickAddChips();
  renderQuickAddStudentResults();
}

function resetQuickAddSearch() {
  if (quickAddStudentSearch) quickAddStudentSearch.value = "";
  resetQuickAddSelection();
  if (quickAddStudentResults) {
    quickAddStudentResults.style.display = "none";
  }
}

function renderQuickAddDateChips() {
  if (!quickAddDateChips) return;
  if (!quickAddDates.size) {
    quickAddDateChips.innerHTML = "";
    return;
  }
  quickAddDateChips.innerHTML = Array.from(quickAddDates)
    .sort()
    .map(date => `
      <span class="student-chip">
        ${date}
        <button type="button" data-remove-quick-date="${date}" aria-label="Remove ${date}">&times;</button>
      </span>`)
    .join("");
}

function addQuickAddDate(dateValue) {
  if (!dateValue) return;
  quickAddDates.add(dateValue);
  renderQuickAddDateChips();
}

function resetQuickAddDates() {
  quickAddDates.clear();
  renderQuickAddDateChips();
}

function getQuickAddDatesForSubmit() {
  const dates = new Set(quickAddDates);
  const currentPickerDate = quickAddDate?.value;
  if (currentPickerDate) dates.add(currentPickerDate);
  return Array.from(dates).sort();
}

if (quickAddBtn) {
  quickAddBtn.addEventListener("click", async () => {
    quickAddModal.style.display = "flex";
    resetQuickAddSelection();
    resetQuickAddDates();
    if (quickAddStudentSearch) quickAddStudentSearch.value = "";
    await loadQuickAddStudents();
    // Default date = today
    quickAddDate.value = new Date().toISOString().split("T")[0];
    resetQuickAddDates();
    addQuickAddDate(quickAddDate.value);
  });
}

if (quickAddCancel) {
  quickAddCancel.addEventListener("click", () => {
    quickAddModal.style.display = "none";
    resetQuickAddSelection();
    resetQuickAddDates();
  });
}

quickAddStudentResults?.addEventListener("click", (event) => {
  const option = event.target.closest(".student-option");
  if (!option) return;
  const student = quickAddStudentPool.find(s => String(s.id) === option.dataset.id);
  toggleQuickAddStudent(student);
});

quickAddStudentSearch?.addEventListener("input", () => renderQuickAddStudentResults());

quickAddStudentChips?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("button[data-remove-student]");
  if (!removeButton) return;
  const id = removeButton.dataset.removeStudent;
  if (quickAddSelection.has(id)) {
    quickAddSelection.delete(id);
    updateQuickAddChips();
    renderQuickAddStudentResults();
  }
});

quickAddClearBtn?.addEventListener("click", () => {
  resetQuickAddSearch();
});

quickAddDateBtn?.addEventListener("click", () => {
  addQuickAddDate(quickAddDate?.value);
});

quickAddDateChips?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("button[data-remove-quick-date]");
  if (!removeButton) return;
  const date = removeButton.dataset.removeQuickDate;
  if (!date) return;
  quickAddDates.delete(date);
  renderQuickAddDateChips();
});

async function loadQuickAddStudents() {
  if (quickAddStudentResults) {
    quickAddStudentResults.innerHTML = "<div class='student-placeholder'>Loading students...</div>";
  }

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  const { data: students, error } = await supabase
    .from("users")
    .select("id, firstName, lastName, roles, teacherIds");

  if (error) {
    if (quickAddStudentResults) {
      quickAddStudentResults.innerHTML = `<div class="student-placeholder">Error: ${error.message}</div>`;
    }
    return;
  }

  let filtered = students.filter(s => {
    const roles = Array.isArray(s.roles) ? s.roles : [s.roles];
    const isStudent = roles.includes("student");
    if (activeRole === "admin") return isStudent;
    if (activeRole === "teacher")
      return isStudent && Array.isArray(s.teacherIds) && s.teacherIds.includes(user.id);
    return false;
  });

  filtered = filtered.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  quickAddStudentPool = filtered;
  quickAddStudentSearch.value = "";
  resetQuickAddSelection();
  renderQuickAddStudentResults();
}

if (quickAddSubmit) {
  quickAddSubmit.addEventListener("click", async () => {
    const selectedIds = Array.from(quickAddSelection.keys());
    const category = quickAddCategory.value;
    const dates = getQuickAddDatesForSubmit();
    const points = quickAddPoints.value ? parseInt(quickAddPoints.value) : (category === "practice" ? 5 : 0);
    const notes = quickAddNotes.value.trim();

    if (selectedIds.length === 0) {
      return alert("Select at least one student.");
    }
    if (!category || !dates.length) {
      return alert("Please select a category and at least one date.");
    }

    const inserts = selectedIds.flatMap(id =>
      dates.map(date => ({
        userId: id,
        category,
        notes,
        date,
        points,
        status: "approved"
      }))
    );

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
    resetQuickAddSelection();
    resetQuickAddDates();
    await new Promise(r => setTimeout(r, 300)); // short delay for backend sync
    location.reload(); // refresh logs
  });
}

  });
