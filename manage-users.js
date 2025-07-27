import { supabase } from './supabase.js';

let allUsers = [];
let currentEditUser = null;
let currentMultiTarget = null;
let currentMultiType = null;
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
  document.getElementById("addUserBtn").addEventListener("click", addUser);
});

async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*").order("lastName");
  if (error) return console.error("Error fetching users:", error);
  allUsers = data;
  renderUsers();
}

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
      <td><button class="blue-button" onclick="openMultiSelect(this,'${user.id}','roles')">${formatArray(user.roles)}</button></td>
      <td><button class="blue-button" onclick="openMultiSelect(this,'${user.id}','teacher')">${getTeacherNames(user.teacher)}</button></td>
      <td><input type="text" value="${user.instrument || ""}" onchange="updateField('${user.id}','instrument',this.value)"></td>
      <td><button id="save-${user.id}" class="blue-button" style="display:none;" onclick="saveUser('${user.id}')">Save</button></td>
    `;

    tbody.appendChild(tr);
  });

  setupAvatarUploads();
  renderPagination();
  syncHeaderWidths(); // ✅ Fix column alignment
}

// ✅ Sync column widths between header and body
function syncHeaderWidths() {
  const headerCells = document.querySelectorAll("#userHeaderTable th");
  const firstRowCells = document.querySelectorAll("#userTable tr:first-child td");
  if (!firstRowCells.length) return;

  headerCells.forEach((th, i) => {
    th.style.width = firstRowCells[i]?.offsetWidth + "px";
  });
}

// ✅ Avatar Upload Handling
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

// ✅ Other helper functions remain unchanged (updateField, saveUser, openMultiSelect, confirmMultiSelect, etc.)
// ✅ Multi-select modal
window.openMultiSelect = function(button, userId, type) {
  currentEditUser = allUsers.find(u => u.id === userId);
  currentMultiTarget = button;
  currentMultiType = type;

  const modal = document.getElementById("multiSelectModal");
  const optionsBox = document.getElementById("multiSelectOptions");
  const title = document.getElementById("multiSelectTitle");
  optionsBox.innerHTML = "";

  let options = [];
  if (type === "roles") {
    title.textContent = "Select Roles";
    options = ["student", "teacher", "admin"];
  } else {
    title.textContent = "Select Teacher(s)";
    options = allUsers.filter(u => u.roles?.includes("teacher") || u.roles?.includes("admin"))
                      .map(u => `${u.id}::${u.firstName} ${u.lastName}`);
  }

  const selected = Array.isArray(currentEditUser[type]) ? currentEditUser[type] : [currentEditUser[type]];

  options.forEach(opt => {
    const [id, name] = opt.includes("::") ? opt.split("::") : [opt, opt];
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = id;
    input.checked = selected.includes(id);
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + name));
    optionsBox.appendChild(label);
  });

  modal.style.display = "flex";
};

window.confirmMultiSelect = function() {
  const checks = document.querySelectorAll("#multiSelectOptions input:checked");
  const values = Array.from(checks).map(c => c.value);
  currentEditUser[currentMultiType] = values;
  currentMultiTarget.textContent = getTeacherNames(values);
  document.getElementById(`save-${currentEditUser.id}`).style.display = "inline-block";
  closeMultiSelectModal();
};

window.closeMultiSelectModal = function() {
  document.getElementById("multiSelectModal").style.display = "none";
};

// ✅ Add New User
async function addUser() {
  const { data, error } = await supabase.from("users").insert([{ firstName: "New", lastName: "User", roles: ["student"], teacher: [] }]).select();
  if (!error) {
    allUsers.push(data[0]);
    renderUsers();
  }
}

// ✅ Pagination Controls
function renderPagination() {
  const controls = document.getElementById("paginationControls");
  controls.innerHTML = "";

  const totalPages = Math.ceil(allUsers.length / usersPerPage);
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener("click", () => {
      currentPage = i;
      renderUsers();
    });
    controls.appendChild(btn);
  }
}
