import { supabase } from './supabase.js';

let allUsers = [];
let currentPage = 1;
const usersPerPage = 25;
let searchQuery = "";
let sortColumn = null;
let sortDirection = 1;

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user || !user.roles?.includes("admin")) {
    alert("Access denied. Admins only.");
    window.location.href = "home.html";
    return;
  }

  await fetchUsers();
  document.getElementById("addUserBtn").addEventListener("click", openAddUserModal);
  setupSearchAndSort();
});

// ✅ Fetch Users
async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*").order("lastName");
  if (error) return console.error("Error fetching users:", error);
  allUsers = data;
  renderUsers();
}

// ✅ Filter & Sort
function getFilteredAndSortedUsers() {
  const query = searchQuery.trim().toLowerCase();

  let filtered = allUsers.filter(u => {
    const teacherNames = ((Array.isArray(u.teacherIds) ? u.teacherIds : [])).map(id => {
      const teacher = allUsers.find(t => String(t.id) === String(id));
      return teacher ? `${teacher.firstName} ${teacher.lastName}`.toLowerCase() : "";
    }).join(" ");

    const rolesText = Array.isArray(u.roles) ? u.roles.join(" ").toLowerCase() : String(u.roles || "").toLowerCase();

    const instrumentText = Array.isArray(u.instrument)
      ? u.instrument.join(" ").toLowerCase()
      : (typeof u.instrument === "string" ? u.instrument.toLowerCase() : "");

    return (
      String(u.firstName || "").toLowerCase().includes(query) ||
      String(u.lastName || "").toLowerCase().includes(query) ||
      String(u.email || "").toLowerCase().includes(query) ||
      instrumentText.includes(query) ||
      teacherNames.includes(query) ||
      rolesText.includes(query)
    );
  });

  if (sortColumn) {
    filtered.sort((a, b) => {
      const valA = String(a[sortColumn] || "").toLowerCase();
      const valB = String(b[sortColumn] || "").toLowerCase();
      return valA > valB ? sortDirection : valA < valB ? -sortDirection : 0;
    });
  }

  return filtered;
}

// ✅ Render Table
function renderUsers() {
  const tbody = document.getElementById("userTableBody");
  tbody.innerHTML = "";

  const start = (currentPage - 1) * usersPerPage;
  const pageUsers = getFilteredAndSortedUsers().slice(start, start + usersPerPage);

  pageUsers.forEach(user => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${user.firstName || ""}" onchange="updateField('${user.id}','firstName',this.value)"></td>
      <td><input type="text" value="${user.lastName || ""}" onchange="updateField('${user.id}','lastName',this.value)"></td>
      <td><input type="email" value="${user.email || ""}" onchange="updateField('${user.id}','email',this.value)"></td>
      <td class="avatar-cell">
        <img src="${user.avatarUrl || 'images/logos/default.png'}" class="avatar-preview">
        <label class="upload-btn">Change
          <input type="file" data-id="${user.id}" class="avatar-upload">
        </label>
      </td>
      <td>${renderRoleTags(user)}</td>
      <td>${renderTeacherTags(user)}</td>
      <td><input type="text" value="${user.instrument || ""}" onchange="updateField('${user.id}','instrument',this.value)"></td>
      <td><button id="save-${user.id}" class="blue-button" style="display:none;" onclick="saveUser('${user.id}')">Save</button></td>
    `;
    tbody.appendChild(tr);
  });

  setupTagListeners();
  setupAvatarUploads();
  renderPagination();
  syncHeaderWidths();
}

// ✅ Tag Renderers
function renderRoleTags(user) {
  const roles = ["student", "teacher", "admin"];
  const selected = Array.isArray(user.roles) ? user.roles : [user.roles].filter(Boolean);
  return buildTagContainer(user.id, "roles", selected, roles);
}

function renderTeacherTags(user) {
  const teacherList = allUsers.filter(u => u.roles?.includes("teacher") || u.roles?.includes("admin"));
  const selected = Array.isArray(user.teacherIds) ? user.teacherIds.map(String) : [user.teacherIds].filter(Boolean).map(String);
  return buildTagContainer(user.id, "teacherIds", selected, teacherList);
}

// ✅ Build Tag Container
function buildTagContainer(userId, type, selected, options) {
  const tags = (type === "roles"
    ? selected
    : selected.map(id => {
        const t = allUsers.find(u => u.id === id);
        return t ? { id, name: `${t.firstName} ${t.lastName}` } : null;
      }).filter(Boolean));

  const optionsHTML = (type === "roles"
    ? options.filter(r => !selected.includes(r)).map(r => `<div class="tag-option" data-value="${r}">${r}</div>`)
    : options.filter(t => !selected.includes(t.id)).map(t => `<div class="tag-option" data-value="${t.id}">${t.firstName} ${t.lastName}</div>`)).join("");

  const tagsHTML = (type === "roles"
    ? tags.map(r => `<span class="tag">${r}<span class="remove-tag" data-value="${r}">×</span></span>`).join("")
    : tags.map(t => `<span class="tag">${t.name}<span class="remove-tag" data-value="${t.id}">×</span></span>`).join(""));

  return `
    <div class="tag-container" data-id="${userId}" data-type="${type}">
      ${tagsHTML}
      <img src="images/icons/plus.png" class="tag-add-icon">
      <div class="tag-options">${optionsHTML}</div>
    </div>
  `;
}

// ✅ Tag Listeners
function setupTagListeners() {
  document.querySelectorAll(".tag-add-icon").forEach(icon => {
    icon.addEventListener("click", e => {
      const container = e.target.closest(".tag-container");
      container.querySelector(".tag-options").classList.toggle("show");
    });
  });

  document.querySelectorAll(".tag-option").forEach(opt => {
    opt.addEventListener("click", e => {
      const container = e.target.closest(".tag-container");
      const id = container.dataset.id;
      const type = container.dataset.type;
      const user = allUsers.find(u => u.id === id);
      const value = e.target.dataset.value;

      if (!Array.isArray(user[type])) user[type] = [];
      if (!user[type].includes(value)) user[type].push(value);

      document.getElementById(`save-${id}`).style.display = "inline-block";
      e.target.remove();

      const tagLabel = (type === "roles") ? value : (allUsers.find(t => t.id === value)?.firstName + " " + allUsers.find(t => t.id === value)?.lastName);
      const newTag = document.createElement("span");
      newTag.className = "tag";
      newTag.innerHTML = `${tagLabel}<span class="remove-tag" data-value="${value}">×</span>`;
      container.insertBefore(newTag, container.querySelector(".tag-add-icon"));

      newTag.querySelector(".remove-tag").addEventListener("click", () => {
        user[type] = user[type].filter(v => v !== value);
        newTag.remove();
        document.getElementById(`save-${id}`).style.display = "inline-block";
      });
    });
  });
}

// ✅ Inline Edit
window.updateField = function(id, field, value) {
  const user = allUsers.find(u => u.id === id);
  if (!user) return;
  user[field] = value;
  document.getElementById(`save-${id}`).style.display = "inline-block";
};

// ✅ Save User
window.saveUser = async function(id) {
  const user = allUsers.find(u => u.id === id);
  const { error } = await supabase.from("users").update(user).eq("id", id);
  if (error) alert("Save failed");
  else {
    document.getElementById(`save-${id}`).style.display = "none";
    fetchUsers();
  }
};

// ✅ Avatar Upload
function setupAvatarUploads() {
  document.querySelectorAll(".avatar-upload").forEach(input => {
    input.addEventListener("change", async e => {
      const file = e.target.files[0];
      if (!file) return;
      const userId = e.target.dataset.id;
      const fileName = `${userId}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
      if (uploadError) return alert("Avatar upload failed");
      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(fileName);
      await supabase.from("users").update({ avatarUrl: publicUrl.publicUrl }).eq("id", userId);
      fetchUsers();
    });
  });
}

// ✅ Invitation Modal for Add User
function openAddUserModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";

  modal.innerHTML = `
    <div class="modal-box">
      <h3>Invite New User</h3>
      <label>First Name</label><input id="newFirstName" type="text">
      <label>Last Name</label><input id="newLastName" type="text">
      <label>Email</label><input id="newEmail" type="email">
      <div class="modal-actions">
        <button class="blue-button" id="sendInviteBtn">Send Invite Link</button>
        <button class="blue-button" id="cancelUserBtn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById("cancelUserBtn").addEventListener("click", () => modal.remove());
  document.getElementById("sendInviteBtn").addEventListener("click", () => {
    sendInviteLink(modal);
  });
}

// ✅ Generate Invite Link
function sendInviteLink(modal) {
  const email = document.getElementById("newEmail").value.trim();
  const firstName = document.getElementById("newFirstName").value.trim();
  const lastName = document.getElementById("newLastName").value.trim();

  if (!email) {
    alert("Please provide an email.");
    return;
  }

  const inviteLink = `https://achievement-app-stripped.vercel.app/signup.html?email=${encodeURIComponent(email)}`;
  alert(`Invite link for ${firstName} ${lastName}: ${inviteLink}`);
  modal.remove();
}

// ✅ Search & Sort Setup
function setupSearchAndSort() {
  document.getElementById("userSearch").addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase();
    currentPage = 1;
    renderUsers();
  });
  document.querySelectorAll("#userHeaderTable th[data-sort]").forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (sortColumn === col) sortDirection *= -1; else { sortColumn = col; sortDirection = 1; }
      renderUsers();
      updateSortIndicators(col);
    });
  });
}

function updateSortIndicators(active) {
  document.querySelectorAll("#userHeaderTable th[data-sort]").forEach(th => {
    th.textContent = th.textContent.replace(/ ▲| ▼/, "");
    if (th.dataset.sort === active) th.textContent += sortDirection === 1 ? " ▲" : " ▼";
  });
}

// ✅ Pagination
function renderPagination() {
  const controls = document.getElementById("paginationControls");
  controls.innerHTML = "";
  const totalPages = Math.ceil(getFilteredAndSortedUsers().length / usersPerPage);
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener("click", () => { currentPage = i; renderUsers(); });
    controls.appendChild(btn);
  }
}

// ✅ Header Width Sync
function syncHeaderWidths() {
  const headerCells = document.querySelectorAll("#userHeaderTable th");
  const rowCells = document.querySelectorAll("#userTable tr:first-child td");
  if (!rowCells.length) return;
  headerCells.forEach((th, i) => { if (rowCells[i]) th.style.width = rowCells[i].offsetWidth + "px"; });
}
