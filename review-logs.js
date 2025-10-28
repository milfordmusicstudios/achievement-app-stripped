import { supabase } from './supabase.js';
import { recalculateUserPoints } from './utils.js';

// === DOM elements ===
const logsSection = document.getElementById("logsSection");
const notificationsSection = document.getElementById("notificationsSection");
const showLogsBtn = document.getElementById("showLogsBtn");
const showNotificationsBtn = document.getElementById("showNotificationsBtn");
const logsTableBody = document.getElementById("logsTableBody");
const statusFilter = document.getElementById("statusFilter");
const searchInput = document.getElementById("searchInput");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAllCheckbox = document.getElementById("selectAll");

let logs = [];
let sortOrder = 1;
let sortColumn = "date";

// === Load Logs ===
async function loadLogs() {
  logsTableBody.innerHTML = "<tr><td colspan='7'>Loading...</td></tr>";

  const { data, error } = await supabase
    .from("logs")
    .select("id, userId, category, date, points, note, status, users(firstName, lastName)")
    .order("date", { ascending: false });

  if (error) {
    logsTableBody.innerHTML = `<tr><td colspan='7'>Error: ${error.message}</td></tr>`;
    return;
  }

  logs = data.map(log => ({
    ...log,
    fullName: `${log.users?.firstName || ""} ${log.users?.lastName || ""}`.trim(),
  }));

  renderLogs();
}

// === Render Logs Table ===
function renderLogs() {
  let filtered = logs;

  // filter by status
  const status = statusFilter.value;
  if (status) filtered = filtered.filter(l => l.status === status);

  // filter by search
  const search = searchInput.value.toLowerCase();
  if (search) {
    filtered = filtered.filter(
      l =>
        l.fullName.toLowerCase().includes(search) ||
        l.category.toLowerCase().includes(search) ||
        l.note?.toLowerCase().includes(search)
    );
  }

  // sort
  filtered.sort((a, b) => {
    if (a[sortColumn] < b[sortColumn]) return -1 * sortOrder;
    if (a[sortColumn] > b[sortColumn]) return 1 * sortOrder;
    return 0;
  });

  logsTableBody.innerHTML = "";

  filtered.forEach(log => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-id="${log.id}"></td>
      <td>${log.fullName}</td>
      <td>${log.category}</td>
      <td>${new Date(log.date).toLocaleDateString()}</td>
      <td>${log.points}</td>
      <td>${log.note || ""}</td>
      <td>
        <select data-id="${log.id}" class="statusSelect">
          <option value="pending" ${log.status === "pending" ? "selected" : ""}>Pending</option>
          <option value="approved" ${log.status === "approved" ? "selected" : ""}>Approved</option>
          <option value="rejected" ${log.status === "rejected" ? "selected" : ""}>Rejected</option>
          <option value="needs info" ${log.status === "needs info" ? "selected" : ""}>Needs Info</option>
        </select>
      </td>
    `;
    logsTableBody.appendChild(tr);
  });
}

// === Update Log Status ===
logsTableBody.addEventListener("change", async e => {
  if (e.target.classList.contains("statusSelect")) {
    const logId = e.target.dataset.id;
    const newStatus = e.target.value;
    const log = logs.find(l => l.id == logId);

    const { error } = await supabase
      .from("logs")
      .update({ status: newStatus })
      .eq("id", logId);

    if (error) {
      alert("Error updating status: " + error.message);
      return;
    }

    // update UI
    log.status = newStatus;
    renderLogs();

    // recalculate user points if status = approved
    if (newStatus === "approved") {
      await recalculateUserPoints(log.userId);
    }
  }
});

// === Delete Selected Logs ===
deleteSelectedBtn.addEventListener("click", async () => {
  const selectedIds = [...document.querySelectorAll("#logsTableBody input[type=checkbox]:checked")].map(cb => cb.dataset.id);
  if (selectedIds.length === 0) return alert("No logs selected.");

  if (!confirm("Delete selected logs?")) return;

  const { error } = await supabase.from("logs").delete().in("id", selectedIds);
  if (error) {
    alert("Error deleting logs: " + error.message);
    return;
  }

  await loadLogs();
});

selectAllCheckbox.addEventListener("change", e => {
  document.querySelectorAll("#logsTableBody input[type=checkbox]").forEach(cb => {
    cb.checked = e.target.checked;
  });
});

statusFilter.addEventListener("change", renderLogs);
searchInput.addEventListener("input", renderLogs);

// === Sorting ===
document.querySelectorAll("#logsHeaderTable th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.getAttribute("data-sort");
    if (sortColumn === col) sortOrder *= -1;
    else {
      sortColumn = col;
      sortOrder = 1;
    }
    renderLogs();
  });
});

// === Notifications Integration ===
if (showLogsBtn && showNotificationsBtn) {
  showLogsBtn.addEventListener("click", () => {
    logsSection.style.display = "block";
    notificationsSection.style.display = "none";
  });

  showNotificationsBtn.addEventListener("click", async () => {
    logsSection.style.display = "none";
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

// === Initialize ===
loadLogs();
