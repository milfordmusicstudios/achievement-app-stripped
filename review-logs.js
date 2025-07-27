import { supabase } from './supabase.js';

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

  let logs = [];
  let users = [];
  let filteredLogs = [];
  let currentSort = { field: "date", order: "desc" };

  // ✅ Pagination variables
  let currentPage = 1;
  let logsPerPage = 50;

  try {
    // ✅ Fetch logs & users
    const { data: logsData, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .order("date", { ascending: false });
    if (logsError) throw logsError;

    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, firstName, lastName");
    if (usersError) throw usersError;

    users = usersData;
    logs = logsData.map(l => ({
      ...l,
      fullName: (users.find(u => u.id === l.userId)?.firstName || "Unknown") +
                " " +
                (users.find(u => u.id === l.userId)?.lastName || "")
    }));

    filteredLogs = [...logs];

    renderCategorySummary(filteredLogs);
    renderLogsTable(filteredLogs);

  } catch (err) {
    console.error("[ERROR] Review Logs:", err);
    alert("Failed to load logs.");
  }

  // ✅ Bulk Approve UI logic
  const bulkPanel = document.getElementById("bulkApprovePanel");
  const bulkPointsInput = document.getElementById("bulkPoints");

  document.getElementById("bulkApproveBtn").addEventListener("click", () => {
    bulkPanel.style.display = "block";
  });

  document.getElementById("cancelBulkApprove").addEventListener("click", () => {
    bulkPanel.style.display = "none";
    bulkPointsInput.value = "";
  });

  // ✅ Confirm Bulk Approve Selected Logs
  document.getElementById("confirmBulkApprove").addEventListener("click", async () => {
    const pointsInput = bulkPointsInput.value.trim();
    const assignPoints = pointsInput !== "";
    const points = assignPoints ? parseInt(pointsInput) : null;

    const selectedIds = Array.from(document.querySelectorAll(".select-log:checked"))
      .map(cb => cb.dataset.id);

    if (selectedIds.length === 0) {
      alert("No logs selected.");
      return;
    }

    if (!confirm(`Approve ${selectedIds.length} logs${assignPoints ? ` with ${points} points` : ""}?`)) return;

    try {
      // ✅ Update only selected logs
      for (let id of selectedIds) {
        const updateData = { status: "approved" };
        if (assignPoints) updateData.points = points;

        const { error } = await supabase.from("logs").update(updateData).eq("id", id);
        if (error) throw error;

        const log = logs.find(l => l.id.toString() === id);
        if (log) {
          log.status = "approved";
          if (assignPoints) log.points = points;
        }
        const flog = filteredLogs.find(l => l.id.toString() === id);
        if (flog) {
          flog.status = "approved";
          if (assignPoints) flog.points = points;
        }
      }
// ✅ Delete Selected Logs
document.getElementById("deleteSelectedBtn").addEventListener("click", async () => {
  const selectedIds = Array.from(document.querySelectorAll(".select-log:checked"))
    .map(cb => cb.dataset.id);

  if (selectedIds.length === 0) {
    alert("No logs selected.");
    return;
  }

  if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} logs? This action cannot be undone.`)) {
    return;
  }

  try {
    const { error } = await supabase.from("logs").delete().in("id", selectedIds);
    if (error) throw error;

    // ✅ Remove from local arrays and refresh table
    logs = logs.filter(l => !selectedIds.includes(l.id.toString()));
    filteredLogs = filteredLogs.filter(l => !selectedIds.includes(l.id.toString()));
    renderLogsTable(filteredLogs);

    alert("✅ Selected logs deleted successfully.");
  } catch (err) {
    console.error("Delete logs failed:", err);
    alert("❌ Failed to delete selected logs.");
  }
});

      renderLogsTable(filteredLogs);
      bulkPanel.style.display = "none";
      bulkPointsInput.value = "";
      alert("✅ Selected logs approved successfully.");
    } catch (err) {
      console.error("Bulk approve failed:", err);
      alert("❌ Failed to approve selected logs.");
    }
  });

  // ✅ Search Filter
  searchInput.addEventListener("input", () => {
    const searchVal = searchInput.value.toLowerCase();
    filteredLogs = logs.filter(l =>
      l.fullName.toLowerCase().includes(searchVal) ||
      (l.notes || "").toLowerCase().includes(searchVal) ||
      (l.category || "").toLowerCase().includes(searchVal)
    );
    currentPage = 1;
    sortLogs();
    renderCategorySummary(filteredLogs);
    renderLogsTable(filteredLogs);
  });

  // ✅ Sorting
  document.querySelectorAll("#logsHeaderTable th").forEach(th => {
    if (!th.dataset.field) return;
    th.addEventListener("click", () => {
      const field = th.dataset.field;
      currentSort.order = (currentSort.field === field && currentSort.order === "asc") ? "desc" : "asc";
      currentSort.field = field;
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

  // ✅ Pagination Controls
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

  document.getElementById("logsPerPage").addEventListener("change", (e) => {
    logsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderLogsTable(filteredLogs);
  });

  // ✅ Select All Checkbox
  document.getElementById("selectAll").addEventListener("change", (e) => {
    document.querySelectorAll(".select-log").forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  // ✅ Render Category Summary
  function renderCategorySummary(logs) {
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
        <h3>${logs.reduce((sum, l) => sum + (l.points || 0), 0)} pts</h3>
        <p>${logs.length} logs</p>
      </div>`;
  }

  // ✅ Auto-resize textarea
  function autoResizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  // ✅ Render Logs Table with Pagination & Checkboxes
  function renderLogsTable(logs) {
    logsTableBody.innerHTML = "";

    const start = (currentPage - 1) * logsPerPage;
    const end = start + logsPerPage;
    const pageLogs = logs.slice(start, end);

    pageLogs.forEach((log, index) => {
      const row = document.createElement("tr");
      row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";
      row.innerHTML = `
        <td><input type="checkbox" class="select-log" data-id="${log.id}"></td>
        <td>${log.fullName}</td>
        <td><input class="edit-input" data-id="${log.id}" data-field="category" value="${log.category}"></td>
        <td><input type="date" class="edit-input" data-id="${log.id}" data-field="date" value="${log.date.split('T')[0]}"></td>
        <td><input type="number" class="edit-input" data-id="${log.id}" data-field="points" value="${log.points}"></td>
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

    const totalPages = Math.ceil(logs.length / logsPerPage);
    document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("prevPageBtn").disabled = currentPage === 1;
    document.getElementById("nextPageBtn").disabled = currentPage === totalPages;

    applyEditListeners();
  }

  // ✅ Apply inline edit listeners
  function applyEditListeners() {
    document.querySelectorAll(".edit-input").forEach(el => {
      if (el.tagName.toLowerCase() === "textarea") {
        autoResizeTextarea(el);
        el.addEventListener("input", () => autoResizeTextarea(el));
      }
      el.addEventListener("change", async e => {
        const logId = e.target.dataset.id;
        const field = e.target.dataset.field;
        let value = e.target.value;
        if (field === "points") value = parseInt(value) || 0;

        const { error } = await supabase.from("logs").update({ [field]: value }).eq("id", logId);
        if (error) {
          alert("Failed to update log.");
          console.error(error);
        } else {
          console.log(`[DEBUG] Updated log ${logId}: ${field} = ${value}`);
        }
      });
    });
  }
});
