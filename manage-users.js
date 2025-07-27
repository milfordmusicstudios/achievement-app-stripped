import { supabase } from './supabase.js';

let allUsers = [];
let currentPage = 1;
const usersPerPage = 25;

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user || !user.roles?.includes("admin")) {
    alert("Access denied. Admins only.");
    window.location.href = "home.html";
    return;
  }

  await fetchUsers();
  document.getElementById("addUserBtn").addEventListener("click", openAddUserModal);
});

// ✅ Fetch users from Supabase
async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*").order("lastName");
  if (error) return console.error("Error fetching users:", error);
  allUsers = data;
  renderUsers();
}

// ✅ Render Users Table
function renderUsers() {
  const tbody = document.getElementById("userTableBody");
  tbody.innerHTML = "";

  const start = (currentPage - 1) * usersPerPage;
  const pageUsers = allUsers.slice(start, start + usersPerPage);

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
      <td>${renderRoleDropdown(user)}</td>
      <td>${renderTeacherDropdown(user)}</td>
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

// ✅ Render Tag Selector for Roles
function renderRoleDropdown(user) {
  const availableRoles = ["student", "teacher", "admin"];
  const selectedRoles = Array.isArray(user.roles) ? user.roles : [user.roles];
  return `
    <div class="tag-container" data-id="${user.id}" data-type="roles">
      ${selectedRoles.map(r => `<span class="tag">${r}<span class="remove-tag" data-value="${r}">×</span></span>`).join("")}
      <button class="tag-add">+</button>
      <div class="tag-options">
        ${availableRoles.filter(r => !selectedRoles.includes(r)).map(r => `<div class="tag-option" data-value="${r}">${r}</div>`).join("")}
      </div>
    </div>
  `;
}

// ✅ Render Tag Selector for Teachers
function renderTeacherDropdown(user) {
  const teacherList = allUsers.filter(u => u.roles?.includes("teacher") || u.roles?.includes("admin"));
  const selected = Array.isArray(user.teacher) ? user.teacher : [user.teacher];
  return `
    <div class="tag-container" data-id="${user.id}" data-type="teacher">
      ${teacherList.filter(t => selected.includes(t.id)).map(t => `<span class="tag">${t.firstName} ${t.lastName}<span class="remove-tag" data-value="${t.id}">×</span></span>`).join("")}
      <button class="tag-add">+</button>
      <div class="tag-options">
        ${teacherList.filter(t => !selected.includes(t.id)).map(t => `<div class="tag-option" data-value="${t.id}">${t.firstName} ${t.lastName}</div>`).join("")}
      </div>
    </div>
  `;
}

// ✅ Tag Interaction Listeners
function setupTagListeners() {
  document.querySelectorAll(".tag-add").forEach(btn => {
    btn.addEventListener("click", e => {
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

      if (type === "roles") {
        if (!Array.isArray(user.roles)) user.roles = [];
        user.roles.push(value);
      } else {
        if (!Array.isArray(user.teacher)) user.teacher = [];
        user.teacher.push(value);
      }

      document.getElementById(`save-${id}`).style.display = "inline-block";
      renderUsers();
    });
  });

  document.querySelectorAll(".remove-tag").forEach(x => {
    x.addEventListener("click", e => {
      const container = e.target.closest(".tag-container");
      const id = container.dataset.id;
      const type = container.dataset.type;
      const value = e.target.dataset.value;
      const user = allUsers.find(u => u.id === id);

      if (type === "roles") {
        user.roles = user.roles.filter(r => r !== value);
      } else {
        user.teacher = user.teacher.filter(t => t !== value);
      }

      document.getElementById(`save-${id}`).style.display = "inline-block";
      renderUsers();
    });
  });
}

// ✅ Inline Editing
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

// ✅ Add User Modal (still uses multi-selects for now)
function openAddUserModal() {
  const teacherOptions = allUsers.filter(u => u.roles?.includes("teacher") || u.roles?.includes("admin"))
    .map(t => `<option value="${t.id}">${t.firstName} ${t.lastName}</option>`).join("");
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.innerHTML = `
    <div class="modal-box">
      <h3>Create New User</h3>
      <label>First Name</label><input id="newFirstName" type="text">
      <label>Last Name</label><input id="newLastName" type="text">
      <label>Email</label><input id="newEmail" type="email">
      <label>Instrument</label><input id="newInstrument" type="text">
      <label>Roles</label>
      <select id="newRoles" multiple style="width:100%; height:60px;">
        <option value="student" selected>student</option>
        <option value="teacher">teacher</option>
        <option value="admin">admin</option>
      </select>
      <label>Assign Teacher(s)</label>
      <select id="newTeachers" multiple style="width:100%; height:100px;">
        ${teacherOptions}
      </select>
      <div class="modal-actions">
        <button class="blue-button" id="createUserBtn">Create</button>
        <button class="blue-button" id="cancelUserBtn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("cancelUserBtn").addEventListener("click", () => modal.remove());
  document.getElementById("createUserBtn").addEventListener("click", async () => {
    await createNewUser();
    modal.remove();
  });
}

// ✅ Create New User
async function createNewUser() {
  const selectedRoles = Array.from(document.getElementById("newRoles").selectedOptions).map(opt => opt.value);
  const selectedTeachers = Array.from(document.getElementById("newTeachers").selectedOptions).map(opt => opt.value);

  const newUser = {
    firstName: document.getElementById("newFirstName").value.trim(),
    lastName: document.getElementById("newLastName").value.trim(),
    email: document.getElementById("newEmail").value.trim(),
    instrument: document.getElementById("newInstrument").value.trim(),
    roles: selectedRoles,
    teacher: selectedTeachers
  };

  const { data, error } = await supabase.from("users").insert([newUser]).select();
  if (error) {
    alert("Failed to create user: " + error.message);
  } else {
    allUsers.push(data[0]);
    renderUsers();
    alert("User created successfully!");
  }
}

// ✅ Pagination
function renderPagination() {
  const controls = document.getElementById("paginationControls");
  controls.innerHTML = "";
  const totalPages = Math.ceil(allUsers.length / usersPerPage);
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener("click", () => { currentPage = i; renderUsers(); });
    controls.appendChild(btn);
  }
}

// ✅ Header Sync
function syncHeaderWidths() {
  const headerCells = document.querySelectorAll("#userHeaderTable th");
  const rowCells = document.querySelectorAll("#userTable tr:first-child td");
  if (!rowCells.length) return;
  headerCells.forEach((th, i) => { if (rowCells[i]) th.style.width = rowCells[i].offsetWidth + "px"; });
}
