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

  // ✅ Inline editing logic remains unchanged
  document.querySelectorAll(".edit-input").forEach(el => {
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
