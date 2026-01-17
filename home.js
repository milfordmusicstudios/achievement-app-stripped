import { supabase } from './supabaseClient.js';
import { ensureStudioContextAndRoute } from './studio-routing.js';
import { ensureUserRow, getAuthUserId } from './utils.js';

const qs = id => document.getElementById(id);
const safeParse = value => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

let currentProfile = null;
let availableUsers = [];


async function loadLevel(levelId) {
  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("id", levelId)
    .single();

  if (error) {
    console.error("Failed to load level", error);
    return null;
  }
  return data;
}

function renderIdentity(profile, level) {
qs('welcomeText').textContent = `Welcome, ${profile.firstName || 'Student'}!`;
const avatarImg = document.getElementById("avatarImg");
const url = profile?.avatarUrl;

if (avatarImg) {
  avatarImg.src = (typeof url === "string" && url.trim())
    ? url
    : "images/icons/default.png";
}
qs('levelBadgeImg').src = level.badge;

  const pct = Math.min(
    100,
    Math.round(
((profile.points - level.minPoints) /
  (level.maxPoints - level.minPoints)) *
  100
    )
  );

  qs('progressFill').style.width = `${pct}%`;
  qs('progressText').textContent = `${profile.points} XP`;
  qs('progressPercent').textContent = `${pct}% complete`;
}

function getUserLabel(user) {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || "Student";
}

function uniqueUsers(users) {
  const map = new Map();
  users.forEach(u => {
    if (u && u.id && !map.has(u.id)) map.set(u.id, u);
  });
  return Array.from(map.values());
}

async function loadAvailableUsers(parentId, fallbackProfile) {
  let users = safeParse(localStorage.getItem("allUsers"));
  if (!Array.isArray(users)) users = [];

  if (!users.length && parentId) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("parent_uuid", parentId)
      .order("created_at", { ascending: true });

    if (!error && Array.isArray(data)) {
      users = data;
      localStorage.setItem("allUsers", JSON.stringify(users));
    }
  }

  if (fallbackProfile) users.push(fallbackProfile);
  return uniqueUsers(users);
}

function closeAvatarMenu() {
  const menu = qs("avatarMenu");
  const button = qs("avatarSwitcher");
  if (!menu || !button) return;
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
}

function renderAvatarMenu(users, activeId) {
  const menu = qs("avatarMenu");
  if (!menu) return;
  menu.innerHTML = "";

  users.forEach(user => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "avatar-menu-item";
    item.setAttribute("role", "menuitem");
    if (user.id === activeId) {
      item.classList.add("is-active");
      item.setAttribute("aria-current", "true");
    }

    const img = document.createElement("img");
    const imgUrl = (typeof user.avatarUrl === "string" && user.avatarUrl.trim())
      ? user.avatarUrl
      : "images/icons/default.png";
    img.src = imgUrl;
    img.alt = "";
    img.onerror = () => {
      img.onerror = null;
      img.src = "images/icons/default.png";
    };

    const label = document.createElement("span");
    label.textContent = getUserLabel(user);

    item.appendChild(img);
    item.appendChild(label);
    item.addEventListener("click", async () => {
      await switchUser(user);
    });
    menu.appendChild(item);
  });
}

async function refreshHomeForUser(profile) {
  const levelRow = await loadLevel(profile.level || 1);
  if (!levelRow) return;
  renderIdentity(profile, levelRow);
}

async function switchUser(user) {
  if (!user || !user.id) return;
  if (currentProfile?.id === user.id) {
    closeAvatarMenu();
    return;
  }

  localStorage.setItem("loggedInUser", JSON.stringify(user));
  localStorage.setItem("activeStudentId", user.id);
  currentProfile = user;

  await refreshHomeForUser(user);
  renderAvatarMenu(availableUsers, user.id);
  closeAvatarMenu();
}

function initAvatarSwitcher(users) {
  const button = qs("avatarSwitcher");
  const menu = qs("avatarMenu");
  if (!button || !menu) return;

  if (!users || users.length <= 1) {
    button.classList.add("no-switch");
    menu.hidden = true;
    return;
  }

  renderAvatarMenu(users, currentProfile?.id);
  menu.hidden = true;

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = !menu.hidden;
    if (isOpen) {
      closeAvatarMenu();
      return;
    }
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) {
      closeAvatarMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAvatarMenu();
  });
}

async function init() {
  // 🔒 Hard auth gate
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    window.location.href = "login.html";
    return;
  }

  const authUserId = await getAuthUserId();
  console.log('[Identity] authUserId', authUserId);
  if (authUserId) {
    const { data: authProfile, error: authErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .single();
    if (!authErr && authProfile) {
      console.log('[Identity] loaded profile id', authProfile.id);
      const name = authProfile.firstName || 'Student';
      qs('welcomeText').textContent = `Welcome, ${name}!`;
    }
  }

  const activeStudioId = localStorage.getItem("activeStudioId");
  console.log('[Home] activeStudioId', activeStudioId);
  if (authUserId && activeStudioId) {
    const [{ data: studioMember }, { data: studioRow }] = await Promise.all([
      supabase
        .from('studio_members')
        .select('roles')
        .eq('user_id', authUserId)
        .eq('studio_id', activeStudioId)
        .single(),
      supabase
        .from('studios')
        .select('name')
        .eq('id', activeStudioId)
        .single()
    ]);

    const studioRoles = Array.isArray(studioMember?.roles) ? studioMember.roles : [];
    const isStaff = studioRoles.includes('admin') || studioRoles.includes('teacher');
    const isAdmin = studioRoles.includes('admin');
    console.log('[Home] studio roles', studioRoles);
    console.log('[Home] isAdminOrTeacher', isStaff);

    const studioNameLine = document.getElementById('studioNameLine');
    if (studioNameLine) {
      studioNameLine.textContent = `Studio: ${studioRow?.name || '—'}`;
    }

    document.querySelectorAll('.student-only').forEach(el => {
      el.style.display = isStaff ? 'none' : '';
    });
    document.querySelectorAll('.staff-only').forEach(el => {
      el.style.display = isStaff ? '' : 'none';
    });
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

    const roleBadge = document.getElementById('roleBadge');
    if (roleBadge) {
      if (isAdmin) {
        roleBadge.textContent = "ADMIN";
        roleBadge.style.display = "";
      } else if (studioRoles.includes('teacher')) {
        roleBadge.textContent = "TEACHER";
        roleBadge.style.display = "";
      } else {
        roleBadge.textContent = "";
        roleBadge.style.display = "none";
      }
    }

    const hideMyPoints = isStaff;
    console.log('[UI] hideMyPoints', hideMyPoints);
    const myPointsLink = document.getElementById('myPointsLink');
    if (myPointsLink) {
      myPointsLink.style.display = hideMyPoints ? 'none' : '';
    }

    if (isStaff) {
      await initStaffQuickLog({
        authUserId,
        studioId: activeStudioId,
        roles: studioRoles
      });
    }
  }

  await ensureUserRow();

  const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
  if (routeResult?.redirected) return;


  // 🔁 Active student must already be selected
  const raw = localStorage.getItem("loggedInUser");
  if (!raw) {
    // Logged in parent, but no student selected yet
    window.location.href = "settings.html";
    return;
  }

const profile = JSON.parse(raw);
currentProfile = profile;

const levelRow = await loadLevel(profile.level || 1);
renderIdentity(profile, levelRow);

const parentId = sessionData?.session?.user?.id;
availableUsers = await loadAvailableUsers(parentId, profile);
initAvatarSwitcher(availableUsers);
}

document.addEventListener('DOMContentLoaded', init);

async function loadCategoriesForStudio(studioId) {
  let rows = [];
  if (studioId) {
    const { data, error } = await supabase
      .from('categories')
      .select('name')
      .eq('studio_id', studioId)
      .order('id', { ascending: true });
    if (!error && Array.isArray(data) && data.length) rows = data;
  }
  if (!rows.length) {
    const { data, error } = await supabase
      .from('categories')
      .select('name')
      .order('id', { ascending: true });
    if (!error && Array.isArray(data) && data.length) rows = data;
  }
  if (!rows.length) {
    rows = [
      { name: 'practice' },
      { name: 'participation' },
      { name: 'performance' },
      { name: 'personal' },
      { name: 'proficiency' }
    ];
  }
  return rows;
}

async function loadStudentsForStudio(studioId) {
  if (!studioId) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, firstName, lastName, roles')
    .eq('studio_id', studioId);
  if (error || !Array.isArray(data)) return [];
  return data.filter(u => Array.isArray(u.roles) && u.roles.includes('student'));
}

function addDateChip(container, dateValue) {
  const existing = Array.from(container.querySelectorAll('[data-date]'))
    .some(el => el.dataset.date === dateValue);
  if (existing) return;

  const chip = document.createElement('span');
  chip.className = 'date-chip';
  chip.dataset.date = dateValue;
  chip.textContent = dateValue;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => chip.remove());

  chip.appendChild(removeBtn);
  container.appendChild(chip);
}

function getSelectedDates(container) {
  return Array.from(container.querySelectorAll('[data-date]'))
    .map(el => el.dataset.date)
    .filter(Boolean);
}

async function insertLogsWithApproval(rows, includeApprovalFields) {
  const payload = includeApprovalFields
    ? rows.map(r => ({
        ...r,
        approved_by: r.created_by,
        approved_at: new Date().toISOString()
      }))
    : rows;

  const { error } = await supabase.from('logs').insert(payload);
  if (!error) return { ok: true };

  const msg = String(error.message || '');
  if (includeApprovalFields && (msg.includes('approved_by') || msg.includes('approved_at'))) {
    const { error: retryErr } = await supabase.from('logs').insert(rows);
    if (retryErr) return { ok: false, error: retryErr };
    return { ok: true };
  }
  return { ok: false, error };
}

async function initStaffQuickLog({ authUserId, studioId, roles }) {
  const form = document.getElementById('staffQuickLogForm');
  if (!form) return;

  const categorySelect = document.getElementById('staffCategory');
  const studentSelect = document.getElementById('staffStudents');
  const dateInput = document.getElementById('staffDate');
  const addDateBtn = document.getElementById('addDateBtn');
  const dateChips = document.getElementById('dateChips');
  const pointsInput = document.getElementById('staffPoints');
  const notesInput = document.getElementById('staffNotes');
  const msgEl = document.getElementById('staffQuickLogMsg');

  const categories = await loadCategoriesForStudio(studioId);
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="">Select category</option>';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      categorySelect.appendChild(opt);
    });
  }

  const students = await loadStudentsForStudio(studioId);
  if (studentSelect) {
    studentSelect.innerHTML = '';
    students.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
      opt.textContent = name;
      studentSelect.appendChild(opt);
    });
  }

  if (addDateBtn && dateInput && dateChips) {
    addDateBtn.addEventListener('click', () => {
      if (!dateInput.value) return;
      addDateChip(dateChips, dateInput.value);
      dateInput.value = '';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!categorySelect || !studentSelect || !pointsInput || !dateChips) return;

    const category = categorySelect.value;
    const points = Number(pointsInput.value);
    const notes = notesInput?.value?.trim() || '';
    const dates = getSelectedDates(dateChips);
    const studentIds = Array.from(studentSelect.selectedOptions).map(o => o.value);

    if (!category || !studentIds.length || !dates.length || !Number.isFinite(points)) return;

    const isStaff = roles.includes('admin') || roles.includes('teacher');
    const status = isStaff ? 'approved' : 'pending';
    const baseRows = [];
    studentIds.forEach(studentId => {
      dates.forEach(date => {
        baseRows.push({
          userId: studentId,
          date,
          category,
          points,
          notes,
          status,
          created_by: authUserId,
          studio_id: studioId
        });
      });
    });

    const includeApproval = isStaff;
    const result = await insertLogsWithApproval(baseRows, includeApproval);
    if (!result.ok) {
      console.error('[QuickLog] insert failed', result.error);
      if (msgEl) {
        msgEl.textContent = 'Failed to submit logs.';
        msgEl.style.display = 'block';
        msgEl.style.color = '#c62828';
      }
      return;
    }

    if (msgEl) {
      msgEl.textContent = `Submitted ${baseRows.length} logs.`;
      msgEl.style.display = 'block';
      msgEl.style.color = '#0b7a3a';
    }
  });
}
