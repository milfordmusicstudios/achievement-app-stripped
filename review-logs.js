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

    // ✅ Initial render
    renderCategorySummary(filteredLogs);
    renderLogsTable(filteredLogs);

  } catch (err) {
    console.error("[ERROR] Review Logs:", err);
    alert("Failed to load logs.");
  }

  // ---------------- LIVE SEARCH ONLY ----------------
  searchInput.addEventListener("input", () => {
    const searchVal = searchInput.value.toLowerCase();
    filteredLogs = logs.filter(l =>
      l.fullName.toLowerCase().includes(searchVal) ||
      (l.notes || "").toLowerCase().includes(searchVal) ||
      (l.category || "").toLowerCase().includes(searchVal)
    );
    sortLogs();
    renderCategorySummary(filteredLogs);
    renderLogsTable(filteredLogs);
  });

  // ---------------- SORT HANDLER ----------------
  document.querySelectorAll("#logsTable th").forEach(th => {
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

  // ---------------- CATEGORY SUMMARY ----------------
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

  // ---------------- AUTO-RESIZE TEXTAREA ----------------
  function autoResizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  // ---------------- RENDER LOGS TABLE ----------------
  function renderLogsTable(logs) {
    logsTableBody.innerHTML = "";
    logs.forEach((log, index) => {
      const row = document.createElement("tr");
      row.className = index % 2 === 0 ? "log-row-even" : "log-row-odd";
      row.innerHTML = `
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

    // ✅ Auto-resize + inline editing
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
