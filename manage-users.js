import { supabase } from "./supabaseClient.js";
import { getViewerContext } from "./utils.js";

let allUsers = [];
let searchQuery = "";
let searchHandlerBound = false;
let currentEditingRow = null;

const editableFields = [
  { field: "firstName", type: "text" },
  { field: "lastName", type: "text" },
  { field: "email", type: "email" }
];

const STATUS_LOADING = "Loading users…";

function renderStatus(message, isError = false) {
  const statusEl = document.getElementById("manageUsersStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c62828" : "#0b4f8a";
}

function formatList(value) {
  if (!value) return "—";
  const list = Array.isArray(value) ? value : [value];
  const normalized = list
    .filter(Boolean)
    .map(item => {
      if (typeof item === "string") return item;
      if (typeof item === "object") {
        if (item.first_name || item.firstName || item.last_name || item.lastName) {
          return `${item.first_name || item.firstName || ""} ${item.last_name || item.lastName || ""}`.trim();
        }
        if (item.label) return item.label;
      }
      return String(item);
    })
    .filter(Boolean);
  return normalized.length ? normalized.join(", ") : "—";
}

function matchesSearch(user) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;
  const first = (user.firstName || user.first_name || "").toLowerCase();
  const last = (user.lastName || user.last_name || "").toLowerCase();
  const email = (user.email || "").toLowerCase();
  const roles = formatList(user.roles).toLowerCase();
  const teachers = formatList(user.teachers).toLowerCase();
  const instruments = formatList(user.instruments).toLowerCase();
  return (
    first.includes(query) ||
    last.includes(query) ||
    email.includes(query) ||
    roles.includes(query) ||
    teachers.includes(query) ||
    instruments.includes(query)
  );
}

function renderUsers() {
  const tbody = document.getElementById("userTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const filtered = allUsers.filter(matchesSearch);
  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.textContent = "No users found.";
    td.style.textAlign = "center";
    tr.appendChild(td);
    tbody.appendChild(tr);
    renderStatus("Loaded 0 users");
    return;
  }
  filtered.forEach(user => {
    const tr = document.createElement("tr");
    tr.dataset.userId = user.id;
    editableFields.forEach(({ field, type }) => {
      tr.appendChild(createEditableCell(user, field, type));
    });
    tr.appendChild(createAvatarCell(user));
    tr.appendChild(createCell(formatList(user.roles)));
    tr.appendChild(createCell(formatList(user.teachers)));
    tr.appendChild(createCell(formatList(user.instruments)));
    tr.appendChild(createCell(user.points));
    tr.appendChild(createCell(user.level));
    tr.appendChild(createActionsCell(tr));
    tbody.appendChild(tr);
  });
  renderStatus(`Loaded ${filtered.length} user${filtered.length === 1 ? "" : "s"}`);
}

function createCell(value) {
  const td = document.createElement("td");
  td.textContent = value || "—";
  return td;
}

function createEditableCell(user, field, type = "text") {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = "cell-text";
  span.dataset.field = field;
  span.textContent = getUserFieldValue(user, field) || "—";
  const input = document.createElement("input");
  input.className = "cell-input";
  input.dataset.field = field;
  input.type = type;
  input.value = getUserFieldValue(user, field);
  input.hidden = true;
  td.appendChild(span);
  td.appendChild(input);
  return td;
}

function getUserFieldValue(user, field) {
  switch (field) {
    case "firstName":
      return user.firstName || user.first_name || "";
    case "lastName":
      return user.lastName || user.last_name || "";
    case "email":
      return user.email || "";
    default:
      return user[field] || "";
  }
}

function createAvatarCell(user) {
  const td = document.createElement("td");
  const img = document.createElement("img");
  img.className = "avatar-sm";
  img.src = user.avatar || user.avatar_url || "images/logos/logo.png";
  img.alt = `${user.firstName || user.first_name || "user"} avatar`;
  td.appendChild(img);
  return td;
}

function createActionsCell(row) {
  const td = document.createElement("td");
  td.className = "actions-cell";
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "blue-button edit-btn";
  editBtn.textContent = "Edit";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "blue-button save-btn";
  saveBtn.textContent = "Save";
  saveBtn.hidden = true;
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "blue-button cancel-btn btn-ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.hidden = true;
  editBtn.addEventListener("click", () => enterEditMode(row));
  saveBtn.addEventListener("click", () => saveRow(row));
  cancelBtn.addEventListener("click", () => cancelEditMode(row));
  td.appendChild(editBtn);
  td.appendChild(saveBtn);
  td.appendChild(cancelBtn);
  return td;
}

function toggleActionButtons(row, editing) {
  const editBtn = row.querySelector(".edit-btn");
  const saveBtn = row.querySelector(".save-btn");
  const cancelBtn = row.querySelector(".cancel-btn");
  if (editBtn) editBtn.hidden = editing;
  if (saveBtn) saveBtn.hidden = !editing;
  if (cancelBtn) cancelBtn.hidden = !editing;
}

function enterEditMode(row) {
  if (!row) return;
  if (currentEditingRow && currentEditingRow !== row) {
    cancelEditMode(currentEditingRow);
  }
  currentEditingRow = row;
  row.classList.add("is-editing");
  row.querySelectorAll(".cell-text").forEach(span => (span.hidden = true));
  row.querySelectorAll(".cell-input").forEach(input => (input.hidden = false));
  toggleActionButtons(row, true);
}

function cancelEditMode(row) {
  if (!row) return;
  const user = allUsers.find(u => String(u.id) === String(row.dataset.userId));
  if (!user) return;
  row.classList.remove("is-editing");
  row.querySelectorAll(".cell-input").forEach(input => {
    input.value = getUserFieldValue(user, input.dataset.field);
    input.hidden = true;
  });
  row.querySelectorAll(".cell-text").forEach(span => {
    span.textContent = getUserFieldValue(user, span.dataset.field) || "—";
    span.hidden = false;
  });
  toggleActionButtons(row, false);
  if (currentEditingRow === row) currentEditingRow = null;
}

async function saveRow(row) {
  if (!row) return;
  const userId = row.dataset.userId;
  const user = allUsers.find(u => String(u.id) === String(userId));
  if (!user) return;
  const updates = {};
  row.querySelectorAll(".cell-input").forEach(input => {
    const field = input.dataset.field;
    const newValue = input.value.trim();
    const oldValue = getUserFieldValue(user, field);
    if (newValue !== oldValue) {
      updates[field] = newValue;
    }
  });
  if (!Object.keys(updates).length) {
    renderStatus("No changes to save.");
    cancelEditMode(row);
    return;
  }
  renderStatus("Saving…");
  const { error } = await supabase.from("users").update(updates).eq("id", userId);
  if (error) {
    renderStatus("Save failed: " + error.message, true);
    console.error(error);
    return;
  }
  Object.assign(user, updates);
  row.querySelectorAll(".cell-text").forEach(span => {
    span.textContent = getUserFieldValue(user, span.dataset.field) || "—";
  });
  renderStatus("Saved.");
  cancelEditMode(row);
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function buildUserNameMap(users) {
  const map = new Map();
  users.forEach(user => {
    const first = user.firstName || user.first_name || "";
    const last = user.lastName || user.last_name || "";
    const fullName = `${first} ${last}`.trim();
    if (fullName) {
      map.set(String(user.id), fullName);
    }
  });
  return map;
}

function getTeacherDisplayValue(entry, nameMap) {
  if (entry === undefined || entry === null) return null;
  if (typeof entry === "string" || typeof entry === "number") {
    const key = String(entry);
    return nameMap.get(key) || key;
  }
  if (typeof entry === "object") {
    const first = entry.firstName || entry.first_name || "";
    const last = entry.lastName || entry.last_name || "";
    const name = `${first} ${last}`.trim();
    if (name) return name;
    if (entry.label) return entry.label;
    if (entry.name) return entry.name;
    if (entry.id) {
      const key = String(entry.id);
      return nameMap.get(key) || key;
    }
    return null;
  }
  return String(entry);
}

function applyTeacherDisplayNames(users) {
  const nameMap = buildUserNameMap(users);
  users.forEach(user => {
    const teacherEntries = ensureArray(user.teachers);
    const resolved = teacherEntries
      .map(entry => getTeacherDisplayValue(entry, nameMap))
      .filter(Boolean);
    user.teachers = resolved.length ? resolved : teacherEntries;
  });
}

function normalizeUser(entry, source = "member") {
  const userData = entry.users || entry;
  return {
    id: userData.id || entry.user_id || entry.userId,
    firstName: userData.first_name || userData.firstName || "",
    lastName: userData.last_name || userData.lastName || "",
    email: userData.email || "",
    avatar: userData.avatar_url || userData.avatarUrl || userData.avatar || "",
    roles: ensureArray(entry.roles || userData.roles),
    teachers: ensureArray(entry.teachers || userData.teacherIds || userData.teachers),
    instruments: ensureArray(entry.instruments || userData.instruments || userData.instrument),
    points: userData.points ?? "",
    level: userData.level ?? ""
  };
}

async function fetchFromStudioMembers(studioId) {
  const { data, error } = await supabase
    .from("studio_members")
    .select("user_id, roles, teachers, instruments, users:users(*)")
    .eq("studio_id", studioId);
  if (error) throw new Error("studio_members query failed: " + error.message);
  return data.map(entry => normalizeUser(entry, "member"));
}

async function fetchFromUsers(studioId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("studio_id", studioId);
  if (error) throw new Error("users query failed: " + error.message);
  return data.map(entry => normalizeUser(entry, "users"));
}

async function resolveStudioId() {
  const viewerContext = await getViewerContext();
  if (viewerContext?.studioId) return viewerContext.studioId;
  const stored = localStorage.getItem("activeStudioId");
  if (stored) return stored;
  throw new Error("Studio ID not found in viewer context or storage.");
}

async function loadUsers() {
  renderStatus(STATUS_LOADING);
  const studioId = await resolveStudioId();
  try {
    allUsers = await fetchFromStudioMembers(studioId);
  } catch (err) {
    console.warn("[ManageUsers] studio_members unavailable:", err.message);
  }
  if (!allUsers.length) {
    try {
      allUsers = await fetchFromUsers(studioId);
    } catch (err) {
      throw new Error("Manage Users: could not load users — check table names (users / studio_members).");
    }
  }
  applyTeacherDisplayNames(allUsers);
}

async function initManageUsersPanel() {
  const tableBody = document.getElementById("userTableBody");
  const searchInput = document.getElementById("manageUsersSearch");
  const statusEl = document.getElementById("manageUsersStatus");
  if (!tableBody || !statusEl) return;
  searchQuery = searchInput?.value || "";
  try {
    await loadUsers();
    renderUsers();
  } catch (err) {
    console.error(err);
    renderStatus(err.message, true);
  }
  if (searchInput && !searchHandlerBound) {
    searchHandlerBound = true;
    searchInput.addEventListener("input", event => {
      searchQuery = event.target.value || "";
      renderUsers();
    });
  }
}

window.initManageUsersPanel = initManageUsersPanel;
document.addEventListener("DOMContentLoaded", initManageUsersPanel);
