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

const ROLE_FALLBACKS = ["admin", "teacher", "parent", "student", "guardian"];
let roleOptions = [];
let teacherOptions = [];

const STATUS_LOADING = "Loading users…";
const isDevMode = (() => {
  if (typeof window === "undefined") return false;
  const env = window.APP_ENV || "";
  const host = window.location?.hostname || "";
  return env === "dev" || host.includes("localhost") || host.includes("127.0.0.1");
})();

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

function normalizeArray(value) {
  return ensureArray(value)
    .map(item => (item === undefined || item === null ? "" : String(item).trim()))
    .filter(Boolean);
}

function arraysEqual(a, b) {
  const normA = normalizeArray(a).sort();
  const normB = normalizeArray(b).sort();
  if (normA.length !== normB.length) return false;
  for (let i = 0; i < normA.length; i++) {
    if (normA[i] !== normB[i]) return false;
  }
  return true;
}

function buildOptionLists(users) {
  const roleSet = new Set();
  const teacherMap = new Map();
  users.forEach(user => {
    ensureArray(user.roles).forEach(role => {
      if (role) roleSet.add(role);
    });
    const hasTeacherRole = ensureArray(user.roles).some(
      role => typeof role === "string" && role.toLowerCase() === "teacher"
    );
    if (hasTeacherRole) {
      const label = `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim() || user.email || "Teacher";
      if (label) {
        teacherMap.set(label, { value: label, label });
      }
    }
  });
  ROLE_FALLBACKS.forEach(role => roleSet.add(role));
  roleOptions = Array.from(roleSet)
    .filter(Boolean)
    .map(role => ({ value: role, label: role }))
    .sort((a, b) => a.label.localeCompare(b.label));
  teacherOptions = Array.from(teacherMap.values()).sort((a, b) => a.label.localeCompare(b.label));
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
    if (user.memberKey) tr.dataset.memberKey = user.memberKey;
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

  if (field === "firstName") {
    const wrapper = document.createElement("div");
    wrapper.className = "first-name-wrapper";
    const pencilBtn = document.createElement("button");
    pencilBtn.type = "button";
    pencilBtn.className = "edit-pencil";
    pencilBtn.setAttribute("aria-label", "Edit user");
    pencilBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 20h14" />
        <path d="M17.4 4.6a2 2 0 0 1 2.8 2.8l-9.7 9.7H7v-4.5z" />
      </svg>
    `;
    pencilBtn.addEventListener("click", event => {
      event.preventDefault();
      const row = td.closest("tr");
      if (row) enterEditMode(row);
    });
    wrapper.appendChild(pencilBtn);
    wrapper.appendChild(span);
    td.appendChild(wrapper);
  } else {
    td.appendChild(span);
  }

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
  img.src = user.avatarUrl || user.avatar || "images/logos/logo.png";
  img.alt = `${user.firstName || user.first_name || "user"} avatar`;
  td.appendChild(img);
  return td;
}

function createActionsCell(row) {
  const td = document.createElement("td");
  td.className = "actions-cell";
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
  saveBtn.addEventListener("click", () => saveRow(row));
  cancelBtn.addEventListener("click", () => cancelEditMode(row));
  td.appendChild(saveBtn);
  td.appendChild(cancelBtn);
  return td;
}

function toggleActionButtons(row, editing) {
  const saveBtn = row.querySelector(".save-btn");
  const cancelBtn = row.querySelector(".cancel-btn");
  const pencilBtn = row.querySelector(".edit-pencil");
  if (saveBtn) saveBtn.hidden = !editing;
  if (cancelBtn) cancelBtn.hidden = !editing;
  if (pencilBtn) pencilBtn.hidden = editing;
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

function getDisplayNameFromUser(user) {
  const displayName = (user?.display_name || user?.displayName || "").trim();
  const first = user?.first_name || user?.firstName || "";
  const last = user?.last_name || user?.lastName || "";
  const fullName = `${first} ${last}`.trim();
  const email = user?.email || "";
  return displayName || fullName || email || "Unknown";
}

function buildMemberKey(member) {
  const studioId = member?.studio_id || member?.studioId || "";
  const userId = member?.user_id || member?.userId || "";
  return `${studioId}:${userId}`;
}

function buildMemberRow(member, user) {
  const firstName = (user?.first_name || user?.firstName || "").trim();
  const lastName = (user?.last_name || user?.lastName || "").trim();
  const email = user?.email || "";
  const avatar = user?.avatarUrl || "images/logos/logo.png";
  const displayName = getDisplayNameFromUser(user);
  const memberKey = buildMemberKey(member);
  const teacherSource = ensureArray(user?.teacherIds);
  const instrumentSource = ensureArray(user?.instrument);
  return {
    ...member,
    id: user?.id || member.user_id || "",
    firstName,
    lastName,
    email,
    avatarUrl: avatar,
    avatar,
    roles: ensureArray(member.roles || user?.roles),
    teachers: teacherSource,
    instruments: instrumentSource,
    points: user?.points ?? null,
    level: user?.level ?? null,
    instrument: instrumentSource,
    user,
    user_name: displayName,
    user_email: email,
    user_avatar_url: avatar,
    memberKey
  };
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

  const { data: members, error: mErr } = await supabase
    .from("studio_members")
    .select("studio_id, user_id, roles, created_at, created_by")
    .eq("studio_id", studioId);

  if (mErr) {
    renderStatus("Failed to load members: " + mErr.message, true);
    console.error("[ManageUsers] studio_members query failed", mErr);
    allUsers = [];
    return [];
  }

  const memberList = Array.isArray(members) ? members : [];
  const userIds = [...new Set(memberList.map(entry => entry.user_id).filter(Boolean))];
  if (userIds.length === 0) {
    renderStatus("No users yet");
    allUsers = [];
    return [];
  }

  let users = [];
  if (userIds.length) {
    const { data, error: uErr } = await supabase
      .from("users")
      .select("id,email,firstName,lastName,roles,avatarUrl,teacherIds,points,level,instrument,active,showonleaderboard,studio_id,parent_uuid")
      .in("id", userIds);
    if (uErr) {
      console.warn("[ManageUsers] users query failed", uErr);
    } else {
      users = Array.isArray(data) ? data : [];
    }
  }

  const usersById = new Map((users || []).map(u => [u.id, u]));
  const rows = memberList.map(entry => buildMemberRow(entry, usersById.get(entry.user_id) || null));

  if (isDevMode) {
    console.debug("[ManageUsers] loaded members/users", { members: memberList.length, users: users?.length || 0 });
  }

  allUsers = rows;
  applyTeacherDisplayNames(allUsers);
  return rows;
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
