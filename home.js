import { supabase } from './supabaseClient.js';
import { ensureStudioContextAndRoute } from './studio-routing.js';
import { ensureUserRow, getAuthUserId, getViewerContext, recalculateUserPoints } from './utils.js';

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
let pendingPointsTotal = 0;
let currentLevelRow = null;
let isStaffUser = false;
let isParentReadOnly = false;
let practiceLoggedToday = false;
function getParentSelectionKey(studioId, viewerUserId) {
  return studioId && viewerUserId ? `aa.activeStudent.${studioId}.${viewerUserId}` : null;
}

function clearParentSelection(viewerUserId, studioId) {
  const key = getParentSelectionKey(studioId, viewerUserId);
  if (key) localStorage.removeItem(key);
  localStorage.removeItem("activeStudentId");
}

function persistParentSelection(viewerUserId, studioId, studentId) {
  const key = getParentSelectionKey(studioId, viewerUserId);
  if (key && studentId) {
    localStorage.setItem(key, String(studentId));
  }
  if (studentId) localStorage.setItem("activeStudentId", String(studentId));
}

function getStudioRoleContext() {
  const rolesRaw = localStorage.getItem("activeStudioRoles");
  let roles = [];
  try {
    roles = JSON.parse(rolesRaw || "[]");
  } catch {
    roles = [];
  }
  return {
    roles,
    studioId: localStorage.getItem("activeStudioId")
  };
}

function logEmptyFetch(label, userId) {
  const ctx = getStudioRoleContext();
  console.log(`[Home] empty ${label}`, {
    activeStudentId: userId,
    roles: ctx.roles,
    studioId: ctx.studioId
  });
}

function getActiveStudentIdForContext(ctx) {
  if (!ctx) return null;
  if (ctx.mode === "student") return ctx.viewerUserId;
  if (ctx.mode === "parent") {
    const key = getParentSelectionKey(ctx.studioId, ctx.viewerUserId);
    return (key && localStorage.getItem(key)) || null;
  }
  return null;
}


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

function renderIdentity(profile, level, showWelcome = true) {
if (showWelcome) {
  qs('welcomeText').textContent = `Welcome, ${profile.firstName || 'Student'}!`;
}
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

function filterParentViewerUsers(users) {
  if (!Array.isArray(users)) return [];
  return users.filter(user => {
    const roles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    if (!roles.length) return true;
    const hasParent = roles.includes("parent");
    const hasStudent = roles.includes("student");
    return hasStudent || !hasParent;
  });
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

function syncParentViewerSelector(activeId) {
  const select = qs("parentStudentSelect");
  if (!select) return;
  const value = String(activeId || "");
  if (value && select.value !== value) select.value = value;
  updateParentProgressState({ hasSelection: !!value });
}

function initParentViewerSelector(users, activeProfile, viewerUserId, studioId) {
  const row = qs("parentViewerRow");
  const select = qs("parentStudentSelect");
  if (!row || !select) return;

  if (!isParentReadOnly || !Array.isArray(users) || users.length === 0) {
    row.style.display = "none";
    return;
  }

  select.innerHTML = "";
  const key = getParentSelectionKey(studioId, viewerUserId);
  const stored = key ? localStorage.getItem(key) : null;
  if (users.length > 1 && !stored) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a student";
    select.appendChild(placeholder);
  }
  users.forEach(user => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = getUserLabel(user);
    select.appendChild(option);
  });

  const activeId = stored || activeProfile?.id || users[0]?.id;
  if (activeId && !(users.length > 1 && !stored)) select.value = activeId;
  select.disabled = users.length <= 1;
  row.style.display = "";

  select.onchange = async () => {
    if (!select.value) return;
    const nextUser = users.find(u => String(u.id) === String(select.value));
    if (nextUser) {
      persistParentSelection(viewerUserId, studioId, nextUser.id);
      updateParentProgressState({ hasSelection: true });
      await switchUser(nextUser);
    }
  };
}

function applyParentReadOnlyUI() {
  const notice = qs("parentReadOnlyNotice");
  const controls = qs("studentLoggingControls");
  const staffMount = qs("staffQuickLogMount");
  const quickLogCard = qs("quickLogCard");
  if (notice) notice.style.display = isParentReadOnly ? "block" : "none";
  if (controls) controls.style.display = isParentReadOnly ? "none" : "";
  if (staffMount) staffMount.style.display = isParentReadOnly ? "none" : "";
  if (quickLogCard) quickLogCard.style.display = isParentReadOnly ? "none" : "";

  const modalLogPractice = qs("modalLogPractice");
  const modalLogOther = qs("modalLogOther");
  if (modalLogPractice) {
    modalLogPractice.disabled = isParentReadOnly;
    modalLogPractice.style.display = isParentReadOnly ? "none" : "";
  }
  if (modalLogOther) {
    modalLogOther.disabled = isParentReadOnly;
    modalLogOther.style.display = isParentReadOnly ? "none" : "";
  }
}

function updateParentProgressState({ hasSelection }) {
  const progressWrap = qs("identityProgress");
  const notice = qs("parentProgressNotice");
  if (!isParentReadOnly) {
    if (progressWrap) progressWrap.style.display = "";
    if (notice) notice.style.display = "none";
    return;
  }
  if (progressWrap) progressWrap.style.display = hasSelection ? "" : "none";
  if (notice) notice.style.display = hasSelection ? "none" : "block";
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

  const ctx = await getViewerContext();
  if (ctx?.mode === "parent") {
    persistParentSelection(ctx.viewerUserId, ctx.studioId, user.id);
  }
  localStorage.setItem("loggedInUser", JSON.stringify(user));
  localStorage.setItem("activeStudentId", user.id);
  currentProfile = user;

  await refreshActiveStudentData({ userId: user.id, fallbackProfile: user });
  renderAvatarMenu(availableUsers, user.id);
  syncParentViewerSelector(user.id);
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

  let viewerContext = await getViewerContext();
  console.log("[Identity] viewer context", viewerContext);
  if (!viewerContext?.viewerUserId) {
    window.location.href = "login.html";
    return;
  }
  if (viewerContext.mode === "unknown") {
    alert("Please finish setup before continuing.");
    window.location.href = "finish-setup.html";
    return;
  }

  const authUserId = viewerContext.viewerUserId;
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

  const activeStudioId = viewerContext.studioId || localStorage.getItem("activeStudioId");
  console.log('[Home] activeStudioId', activeStudioId);
  if (authUserId && activeStudioId) {
    const { data: studioRow } = await supabase
      .from('studios')
      .select('name')
      .eq('id', activeStudioId)
      .single();

    const isStaff = viewerContext.mode === "staff";
    const isAdmin = viewerContext.isAdmin;
    isStaffUser = isStaff;
    isParentReadOnly = viewerContext.mode === "parent";
    if (isParentReadOnly) document.body.classList.add('is-parent');
    if (isStaff) document.body.classList.add('is-staff');
    if (isAdmin) document.body.classList.add('is-admin');
    console.log('[Home] viewer roles', viewerContext.viewerRoles);
    console.log('[Home] isStaff', isStaff);

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
      } else if (viewerContext.isTeacher) {
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
      renderStaffQuickLogShell();
      await initStaffQuickLog({
        authUserId,
        studioId: activeStudioId,
        roles: viewerContext.viewerRoles
      });
    }
    applyParentReadOnlyUI();
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

  if (viewerContext?.mode === "student") {
    clearParentSelection(viewerContext.viewerUserId, viewerContext.studioId);
    if (viewerContext.viewerUserId && String(profile?.id) !== String(viewerContext.viewerUserId)) {
      const { data: viewerProfile } = await supabase
        .from("users")
        .select("*")
        .eq("id", viewerContext.viewerUserId)
        .single();
      if (viewerProfile) {
        currentProfile = viewerProfile;
        localStorage.setItem("loggedInUser", JSON.stringify(viewerProfile));
      }
    }
  }

  const parentId = sessionData?.session?.user?.id;
availableUsers = await loadAvailableUsers(parentId, profile);
if (isParentReadOnly) {
  availableUsers = filterParentViewerUsers(availableUsers);
}
initAvatarSwitcher(availableUsers);

  if (viewerContext?.mode === "parent") {
    const storedKey = getParentSelectionKey(viewerContext.studioId, viewerContext.viewerUserId);
    const stored = storedKey ? localStorage.getItem(storedKey) : null;
    if (!stored && availableUsers.length === 1) {
      persistParentSelection(viewerContext.viewerUserId, viewerContext.studioId, availableUsers[0].id);
    }
  }

initParentViewerSelector(availableUsers, profile, viewerContext.viewerUserId, viewerContext.studioId);

  if (viewerContext?.mode === "parent") {
    const storedKey = getParentSelectionKey(viewerContext.studioId, viewerContext.viewerUserId);
    if (storedKey && !localStorage.getItem(storedKey)) {
      console.log("[Identity] parent requires student selection", {
        viewerUserId: viewerContext.viewerUserId,
        studioId: viewerContext.studioId
      });
      updateParentProgressState({ hasSelection: false });
      return;
    }
  }

await refreshActiveStudentData({ fallbackProfile: profile });
if (!isStaffUser && !isParentReadOnly) {
  await initStudentLogActions();
}
}

document.addEventListener('DOMContentLoaded', init);

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showToast(message) {
  const toast = qs("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function closeStudentModal() {
  const overlay = qs("studentLogModalOverlay");
  if (overlay) overlay.style.display = "none";
}

function openStudentModal({ title, bodyHtml, submitLabel, onSubmit }) {
  const overlay = qs("studentLogModalOverlay");
  const titleEl = qs("studentLogModalTitle");
  const bodyEl = qs("studentLogModalBody");
  const submitBtn = qs("studentLogModalSubmit");
  const cancelBtn = qs("studentLogModalCancel");
  const closeBtn = qs("studentLogModalClose");
  if (!overlay || !titleEl || !bodyEl || !submitBtn || !cancelBtn || !closeBtn) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  submitBtn.textContent = submitLabel || "Submit";
  submitBtn.onclick = async (e) => {
    e.preventDefault();
    await onSubmit();
  };
  cancelBtn.onclick = (e) => {
    e.preventDefault();
    closeStudentModal();
  };
  closeBtn.onclick = (e) => {
    e.preventDefault();
    closeStudentModal();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) closeStudentModal();
  };
  overlay.style.display = "flex";
}

function setPracticeButtonState(button, logged) {
  if (!button) return;
  if (logged) {
    button.disabled = true;
    button.innerHTML = "✅ <span>You already logged today&apos;s practice</span>";
  } else {
    button.disabled = false;
    button.innerHTML = "✅ <span>Log Today&apos;s Practice</span> <span class=\"muted\">(+5 XP)</span>";
  }
}

async function checkPracticeLoggedToday(userId) {
  const today = getTodayString();
  const { data, error } = await supabase
    .from("logs")
    .select("id")
    .eq("userId", userId)
    .eq("category", "practice")
    .eq("date", today)
    .limit(1);
  if (error) {
    console.error("Failed to check practice logs", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function applyApprovedRecalc(userId) {
  const result = await recalculateUserPoints(userId);
  if (!result || !currentProfile || currentProfile.id !== userId) return;
  currentProfile.points = result.totalPoints;
  currentProfile.level = result.currentLevel?.id || currentProfile.level;
  localStorage.setItem("loggedInUser", JSON.stringify(currentProfile));
  currentLevelRow = await loadLevel(currentProfile.level || 1);
  if (currentLevelRow) renderIdentity(currentProfile, currentLevelRow);
  updatePendingProgressFill();
}

async function loadPendingPoints(userId) {
  if (!userId) return;
  console.log("[Home] fetching pending logs for userId", userId);
  const { data, error } = await supabase
    .from("logs")
    .select("points")
    .eq("userId", userId)
    .eq("status", "pending");
  if (error) {
    console.error("Failed to load pending logs", error);
    pendingPointsTotal = 0;
    return;
  }
  if (!data || data.length === 0) {
    logEmptyFetch("pending logs", userId);
  }
  pendingPointsTotal = (data || []).reduce((sum, log) => sum + (log.points || 0), 0);
}

function updatePendingProgressFill() {
  const pendingEl = qs("progressFillPending");
  if (!pendingEl || !currentProfile || !currentLevelRow) return;
  const range = Math.max(1, currentLevelRow.maxPoints - currentLevelRow.minPoints);
  const approvedPct = Math.min(100, Math.round(((currentProfile.points - currentLevelRow.minPoints) / range) * 100));
  const pendingPct = Math.max(0, Math.round((pendingPointsTotal / range) * 100));
  const combined = Math.min(100, approvedPct + pendingPct);
  pendingEl.style.width = `${combined}%`;
}

async function refreshActiveStudentData({ userId, fallbackProfile } = {}) {
  const ctx = await getViewerContext();
  const activeStudentId = userId || getActiveStudentIdForContext(ctx);
  if (!activeStudentId) {
    updateParentProgressState({ hasSelection: false });
    return;
  }

  const { data: profileRow, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", activeStudentId)
    .single();

  if (error) {
    console.error("[Home] Failed to refresh profile", error);
  }

  const profile = profileRow || fallbackProfile || currentProfile;
  if (profile) {
    currentProfile = profile;
    localStorage.setItem("loggedInUser", JSON.stringify(profile));
    currentLevelRow = await loadLevel(profile.level || 1);
    if (currentLevelRow) {
      const showWelcome = ctx.mode === "student";
      renderIdentity(profile, currentLevelRow, showWelcome);
    }
  }

  updateParentProgressState({ hasSelection: true });
  await loadPendingPoints(activeStudentId);
  updatePendingProgressFill();
  practiceLoggedToday = await checkPracticeLoggedToday(activeStudentId);
  setPracticeButtonState(qs("quickPracticeBtn"), practiceLoggedToday);
}

function buildCategoryHeader(category, label) {
  const safeCategory = String(category || "").toLowerCase();
  const imgSrc = safeCategory ? `images/categories/${safeCategory}.png` : "images/categories/allCategories.png";
  return `
    <div class="modal-category">
      <img src="${imgSrc}" alt="${label}">
      <div class="modal-category-text">
        <div class="modal-category-label">${label}</div>
      </div>
    </div>
  `;
}

async function insertLogs(rows, { approved }) {
  const ctx = await getViewerContext();
  if (ctx?.mode === "parent") {
    showToast("Parents are read-only.");
    return false;
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const authUserId = sessionData?.session?.user?.id || null;
  if (!authUserId) {
    if (sessionError) console.error("[Home] session check failed", sessionError);
    window.location.href = "login.html";
    return false;
  }

  const studioId = localStorage.getItem("activeStudioId") || null;
  const payload = rows.map(row => ({
    ...row,
    created_by: row.created_by || authUserId,
    ...(studioId ? { studio_id: studioId } : {})
  }));

  const { error } = await supabase.from("logs").insert(payload);
  if (error) {
    console.error("Failed to save log:", error);
    const message = String(error.message || "");
    if (message.toLowerCase().includes("row-level security")) {
      showToast("Please log in again.");
    } else {
      showToast("Couldn't save log. Try again.");
    }
    return false;
  }
  if (approved && rows.length > 0) {
    await applyApprovedRecalc(rows[0].userId);
  }
  return true;
}

async function initStudentLogActions() {
  const practiceBtn = qs("quickPracticeBtn");
  if (practiceBtn) {
    practiceBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const ctx = await getViewerContext();
      console.log("[Home] log action context", ctx);
      if (ctx?.mode === "parent") {
        showToast("Parents are read-only.");
        return;
      }
      if (!ctx?.activeStudentId) return;
      const activeStudentId = ctx.activeStudentId;
      practiceLoggedToday = await checkPracticeLoggedToday(activeStudentId);
      setPracticeButtonState(practiceBtn, practiceLoggedToday);
      if (practiceLoggedToday) {
        showToast("You already logged today's practice.");
        return;
      }
      const today = getTodayString();
      const ok = await insertLogs([{
        userId,
        category: "practice",
        notes: "",
        date: today,
        points: 5,
        status: "approved"
      }], { approved: true });
      if (ok) {
        await refreshActiveStudentData({ userId: activeStudentId });
        showToast("✅ Practice logged (+5)");
      }
    });
  }

  const pastPracticeBtn = qs("logPastPracticeBtn");
  if (pastPracticeBtn) {
    pastPracticeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const ctx = await getViewerContext();
      console.log("[Home] log action context", ctx);
      if (ctx?.mode === "parent") {
        showToast("Parents are read-only.");
        return;
      }
      if (!ctx?.activeStudentId) return;
      await openPastPracticeModal(ctx.activeStudentId);
    });
  }

  document.querySelectorAll(".action-grid .chip").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const ctx = await getViewerContext();
      console.log("[Home] log action context", ctx);
      if (ctx?.mode === "parent") {
        showToast("Parents are read-only.");
        return;
      }
      if (!ctx?.activeStudentId) return;
      await openChipModal(btn, ctx.activeStudentId);
    });
  });
}

async function openPastPracticeModal(userId) {
  const today = new Date();
  const todayStr = getTodayString();
  const start = new Date();
  start.setDate(today.getDate() - 29);
  const startStr = start.toISOString().split("T")[0];

  const { data: existing, error } = await supabase
    .from("logs")
    .select("date")
    .eq("userId", userId)
    .eq("category", "practice")
    .gte("date", startStr)
    .lte("date", todayStr);
  if (error) console.error("Failed to load practice dates", error);

  const existingDates = new Set((existing || []).map(row => row.date));

  const selectedDates = new Set();
  openStudentModal({
    title: "Log Past Practice",
    submitLabel: "Log Practice",
    bodyHtml: `
      ${buildCategoryHeader("practice", "Practice")}
      <div class="modal-field">
        <label>Select dates (last 30 days)</label>
        <div class="calendar">
          <div class="calendar-header">
            <button id="calPrev" class="calendar-nav" type="button">‹</button>
            <div id="calMonthLabel" class="calendar-title"></div>
            <button id="calNext" class="calendar-nav" type="button">›</button>
          </div>
          <div class="calendar-weekdays">
            <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
          </div>
          <div id="practiceCalendar" class="calendar-grid"></div>
        </div>
      </div>
      <div class="modal-field">
        <label>Points</label>
        <input class="points-readonly" type="text" value="5 points per day" disabled>
      </div>
      <div class="modal-field">
        <label>Notes (optional)</label>
        <textarea id="practiceNotes" placeholder="Optional note"></textarea>
      </div>
      <div class="status-note">Approved</div>
    `,
    onSubmit: async () => {
      const notes = qs("practiceNotes")?.value?.trim() || "";
      const selected = Array.from(selectedDates);
      if (!selected.length) {
        showToast("Select at least one date.");
        return;
      }
      const rows = selected.map(date => ({
        userId,
        category: "practice",
        notes,
        date,
        points: 5,
        status: "approved"
      }));
      const ok = await insertLogs(rows, { approved: true });
      if (ok) {
        showToast(`✅ Logged ${selected.length} practice day(s)`);
        await refreshActiveStudentData({ userId });
        closeStudentModal();
      }
    }
  });

  const calendarEl = qs("practiceCalendar");
  const monthLabel = qs("calMonthLabel");
  const prevBtn = qs("calPrev");
  const nextBtn = qs("calNext");
  if (!calendarEl || !monthLabel || !prevBtn || !nextBtn) return;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const view = {
    year: today.getFullYear(),
    month: today.getMonth()
  };

  const startRange = new Date(startStr);
  startRange.setHours(0, 0, 0, 0);
  const endRange = new Date(todayStr);
  endRange.setHours(23, 59, 59, 999);

  const clampToRange = (date) => date >= startRange && date <= endRange;

  const renderCalendar = () => {
    calendarEl.innerHTML = "";
    const firstDay = new Date(view.year, view.month, 1);
    const startDay = firstDay.getDay();
    const gridStart = new Date(view.year, view.month, 1 - startDay);
    monthLabel.textContent = `${monthNames[view.month]} ${view.year}`;

    const monthStart = new Date(view.year, view.month, 1);
    const monthEnd = new Date(view.year, view.month + 1, 0);
    prevBtn.disabled = monthStart <= startRange;
    nextBtn.disabled = monthEnd >= endRange;

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      const dateStr = cellDate.toISOString().split("T")[0];
      const inMonth = cellDate.getMonth() === view.month;
      const inRange = clampToRange(cellDate);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-day";
      cell.dataset.date = dateStr;
      cell.textContent = String(cellDate.getDate());

      if (!inMonth) cell.classList.add("outside");
      if (!inRange || existingDates.has(dateStr)) {
        cell.classList.add("disabled");
        cell.disabled = true;
      } else {
        cell.addEventListener("click", () => {
          if (selectedDates.has(dateStr)) {
            selectedDates.delete(dateStr);
            cell.classList.remove("selected");
          } else {
            selectedDates.add(dateStr);
            cell.classList.add("selected");
          }
        });
      }

      if (selectedDates.has(dateStr)) {
        cell.classList.add("selected");
      }

      calendarEl.appendChild(cell);
    }
  };

  prevBtn.addEventListener("click", () => {
    const prevMonth = new Date(view.year, view.month - 1, 1);
    if (prevMonth >= startRange) {
      view.year = prevMonth.getFullYear();
      view.month = prevMonth.getMonth();
      renderCalendar();
    }
  });

  nextBtn.addEventListener("click", () => {
    const nextMonth = new Date(view.year, view.month + 1, 1);
    if (nextMonth <= endRange) {
      view.year = nextMonth.getFullYear();
      view.month = nextMonth.getMonth();
      renderCalendar();
    }
  });

  renderCalendar();
}

async function openChipModal(button, userId) {
  const logType = button.dataset.logType || "fixed";
  const category = button.dataset.category || "";
  const label = button.dataset.hint || button.textContent.trim();
  const points = Number(button.dataset.points || 0);
  const notesPrompt = button.dataset.notesPrompt || "";
  const notesRequired = logType === "festival"
    ? false
    : button.dataset.notesRequired !== "false";

  if (logType === "outside-performance") {
    const existingPoints = await getOutsidePerformancePointsThisMonth(userId);
    if (existingPoints >= 100 || existingPoints + points > 100) {
      showToast("You’ve reached the 100-point outside performance limit for this month.");
      return;
    }
  }

  if (logType === "festival") {
    openFestivalModal({ userId, category, label });
    return;
  }

  if (logType === "memorization") {
    openMemorizationModal({ userId, category, label, notesPrompt, notesRequired });
    return;
  }

  const isDiscretionary = logType === "discretionary";
  openFixedModal({
    userId,
    category,
    label,
    points,
    notesRequired,
    notesPrompt,
    notePrefix: logType === "outside-performance" ? "[Outside Performance] " : "",
    statusText: "Pending approval",
    submitLabel: "Submit",
    statusValue: "pending",
    pointsHint: isDiscretionary ? "5 (teacher may adjust)" : null
  });
}

async function getOutsidePerformancePointsThisMonth(userId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startStr = getLocalDateString(monthStart);
  const endStr = getLocalDateString(monthEnd);
  const { data, error } = await supabase
    .from("logs")
    .select("points")
    .eq("userId", userId)
    .eq("category", "performance")
    .in("status", ["pending", "approved"])
    .gte("date", startStr)
    .lte("date", endStr)
    .ilike("notes", "[Outside Performance]%");
  if (error) {
    console.error("Failed outside performance check", error);
    return 0;
  }
  return (data || []).reduce((sum, row) => sum + (row.points || 0), 0);
}

function openFixedModal({ userId, category, label, points, notesRequired, notesPrompt, notePrefix, statusText, submitLabel, statusValue, pointsHint }) {
  const safePoints = Number.isFinite(points) && points > 0 ? points : 5;
  const pointsLabel = pointsHint || safePoints;
  const noteLabel = notesPrompt || `Notes${notesRequired ? " (required)" : " (optional)"}`;
  const notePlaceholder = notesPrompt || "Add a note";
  openStudentModal({
    title: label,
    submitLabel,
    bodyHtml: `
      ${buildCategoryHeader(category, label)}
      <div class="modal-field">
        <label>Date</label>
        <input id="logDateInput" type="date" value="${getTodayString()}">
      </div>
      <div class="modal-field">
        <label>Points</label>
        <input id="logPointsInput" class="points-readonly" type="text" value="${pointsLabel}" disabled>
      </div>
      <div class="modal-field">
        <label>${noteLabel}</label>
        <textarea id="logNotesInput" placeholder="${notePlaceholder}" ${notesRequired ? "required" : ""}></textarea>
      </div>
      <div class="status-note">${statusText}</div>
    `,
    onSubmit: async () => {
      const date = qs("logDateInput")?.value;
      const notesValue = qs("logNotesInput")?.value?.trim() || "";
      if (!date) {
        showToast("Select a date.");
        return;
      }
      if (notesRequired && !notesValue) {
        showToast("Please add a note");
        return;
      }
      const notes = `${notePrefix || ""}${notesValue}`.trim();
      const ok = await insertLogs([{
        userId,
        category,
        notes,
        date,
        points: safePoints,
        status: statusValue
      }], { approved: statusValue === "approved" });
      if (ok) {
        showToast("Log submitted.");
        await refreshActiveStudentData({ userId });
        closeStudentModal();
      }
    }
  });
}

function openFestivalModal({ userId, category, label }) {
  openStudentModal({
    title: label,
    submitLabel: "Submit",
    bodyHtml: `
      ${buildCategoryHeader(category, label)}
      <div class="modal-field">
        <label>Date</label>
        <input id="festivalDateInput" type="date" value="${getTodayString()}">
      </div>
      <div class="modal-field">
        <label>Rating</label>
        <select id="festivalRating">
          <option value="superior">Superior (200)</option>
          <option value="excellent">Excellent (150)</option>
          <option value="other">Other (100)</option>
        </select>
      </div>
      <div class="modal-field">
        <label>Points</label>
        <input id="festivalPoints" class="points-readonly" type="text" value="200" disabled>
      </div>
      <div class="modal-field">
        <label>Notes (optional)</label>
        <textarea id="festivalNotes" placeholder="Add a note"></textarea>
      </div>
      <div class="status-note">Pending approval</div>
    `,
    onSubmit: async () => {
      const date = qs("festivalDateInput")?.value;
      const rating = qs("festivalRating")?.value;
      const notes = qs("festivalNotes")?.value?.trim() || "";
      if (!date) {
        showToast("Select a date.");
        return;
      }
      const pointsMap = { superior: 200, excellent: 150, other: 100 };
      const points = pointsMap[rating] || 100;
      const ok = await insertLogs([{
        userId,
        category,
        notes,
        date,
        points,
        status: "pending"
      }], { approved: false });
      if (ok) {
        showToast("Log submitted.");
        await refreshActiveStudentData({ userId });
        closeStudentModal();
      }
    }
  });

  const ratingSelect = qs("festivalRating");
  const pointsInput = qs("festivalPoints");
  if (ratingSelect && pointsInput) {
    ratingSelect.addEventListener("change", () => {
      const pointsMap = { superior: 200, excellent: 150, other: 100 };
      pointsInput.value = pointsMap[ratingSelect.value] || 100;
    });
  }
}

function openMemorizationModal({ userId, category, label, notesRequired, notesPrompt }) {
  const noteLabel = notesPrompt || "Notes";
  const notePlaceholder = notesPrompt || "Add a note";
  openStudentModal({
    title: label,
    submitLabel: "Submit",
    bodyHtml: `
      ${buildCategoryHeader(category, label)}
      <div class="modal-field">
        <label>Date</label>
        <input id="memorizationDateInput" type="date" value="${getTodayString()}">
      </div>
      <div class="modal-field">
        <label>Measures</label>
        <input id="memorizationMeasures" type="number" min="1" value="1">
      </div>
      <div class="modal-field">
        <label>Points</label>
        <input id="memorizationPoints" class="points-readonly" type="text" value="2" disabled>
      </div>
      <div class="modal-field">
        <label>${noteLabel}</label>
        <textarea id="memorizationNotes" placeholder="${notePlaceholder}" ${notesRequired ? "required" : ""}></textarea>
      </div>
      <div class="status-note">Pending approval</div>
    `,
    onSubmit: async () => {
      const date = qs("memorizationDateInput")?.value;
      const measures = parseInt(qs("memorizationMeasures")?.value, 10);
      const notes = qs("memorizationNotes")?.value?.trim() || "";
      if (!date || !Number.isFinite(measures) || measures < 1) {
        showToast("Enter a measures count.");
        return;
      }
      if (notesRequired && !notes) {
        showToast("Please add a note");
        return;
      }
      const points = measures * 2;
      const ok = await insertLogs([{
        userId,
        category,
        notes,
        date,
        points,
        status: "pending"
      }], { approved: false });
      if (ok) {
        showToast("Log submitted.");
        await refreshActiveStudentData({ userId });
        closeStudentModal();
      }
    }
  });

  const measuresInput = qs("memorizationMeasures");
  const pointsInput = qs("memorizationPoints");
  if (measuresInput && pointsInput) {
    measuresInput.addEventListener("input", () => {
      const value = parseInt(measuresInput.value, 10);
      pointsInput.value = Number.isFinite(value) && value > 0 ? String(value * 2) : "0";
    });
  }
}

function renderStaffQuickLogShell() {
  const mount = document.getElementById('staffQuickLogMount');
  if (!mount) return;
  mount.innerHTML = `
    <section class="home-staff staff-only" aria-label="Staff quick log">
      <form id="staffQuickLogForm" class="staff-card">
        <div class="ql-category-pop">
          <label for="staffCategory">Category</label>
          <select id="staffCategory" required disabled>
            <option value="">Loading...</option>
          </select>
        </div>

        <label for="staffStudents">Students</label>
        <select id="staffStudents" multiple required disabled>
          <option value="">Loading...</option>
        </select>

        <label>Dates</label>
        <button id="staffCalendarToggle" class="blue-button staff-calendar-toggle" type="button">
          Select dates
        </button>
        <div id="staffCalendarPanel" class="staff-calendar-panel" hidden>
          <div class="calendar">
            <div class="calendar-header">
              <button id="staffCalPrev" class="calendar-nav" type="button">‹</button>
              <div id="staffCalMonthLabel" class="calendar-title"></div>
              <button id="staffCalNext" class="calendar-nav" type="button">›</button>
            </div>
            <div class="calendar-weekdays">
              <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>
            <div id="staffCalendar" class="calendar-grid"></div>
          </div>
        </div>

        <label for="staffPoints">Points</label>
        <input id="staffPoints" type="number" min="0" required />

        <label for="staffNotes">Notes</label>
        <input id="staffNotes" type="text" />

        <div id="staffQuickLogError" class="staff-msg" style="display:none;"></div>
        <p id="staffQuickLogMsg" class="staff-msg" style="display:none;"></p>

        <div class="button-row" style="margin-top:10px;">
          <button id="staffQuickLogSubmit" type="submit" class="blue-button staff-submit" disabled>Submit Points</button>
        </div>
      </form>
    </section>
  `;
}

async function loadCategoriesForStudio(studioId) {
  if (!studioId) return { data: [], error: new Error('Missing studio id') };
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('id', { ascending: true });
  if (error || !Array.isArray(data)) return { data: [], error };
  return { data, error: null };
}

async function loadStudentsForStudio(studioId) {
  if (!studioId) return { data: [], error: new Error('Missing studio id') };
  const { data, error } = await supabase
    .from('users')
    .select('id, firstName, lastName, email')
    .eq('studio_id', studioId)
    .eq('active', true)
    .contains('roles', ['student']);
  if (error || !Array.isArray(data)) return { data: [], error };
  return { data, error: null };
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
  removeBtn.textContent = 'x';
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
  const calendarEl = document.getElementById('staffCalendar');
  const monthLabel = document.getElementById('staffCalMonthLabel');
  const prevBtn = document.getElementById('staffCalPrev');
  const nextBtn = document.getElementById('staffCalNext');
  const calendarToggle = document.getElementById('staffCalendarToggle');
  const calendarPanel = document.getElementById('staffCalendarPanel');
  const pointsInput = document.getElementById('staffPoints');
  const notesInput = document.getElementById('staffNotes');
  const msgEl = document.getElementById('staffQuickLogMsg');
  const errorEl = document.getElementById('staffQuickLogError');
  const submitBtn = document.getElementById('staffQuickLogSubmit');
  const selectedDates = new Set();

  const setError = (message) => {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.style.color = '#c62828';
  };

  const today = new Date();
  const todayStr = getTodayString();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const view = { year: today.getFullYear(), month: today.getMonth() };

  const updateStaffCalendarToggle = () => {
    if (!calendarToggle) return;
    const count = selectedDates.size;
    calendarToggle.textContent = count ? `Dates (${count} selected)` : "Select dates";
  };

  const renderStaffCalendar = () => {
    if (!calendarEl || !monthLabel || !prevBtn || !nextBtn) return;
    calendarEl.innerHTML = "";

    const firstDay = new Date(view.year, view.month, 1);
    const startDay = firstDay.getDay();
    const gridStart = new Date(view.year, view.month, 1 - startDay);
    monthLabel.textContent = `${monthNames[view.month]} ${view.year}`;

    const endRange = new Date(todayStr);
    endRange.setHours(23, 59, 59, 999);

    const monthStart = new Date(view.year, view.month, 1);
    const monthEnd = new Date(view.year, view.month + 1, 0);
    prevBtn.disabled = false;
    nextBtn.disabled = monthEnd >= endRange;

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      const dateStr = getLocalDateString(cellDate);
      const inMonth = cellDate.getMonth() === view.month;
      const inRange = cellDate <= endRange;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-day";
      cell.dataset.date = dateStr;
      cell.textContent = String(cellDate.getDate());

      if (!inMonth) cell.classList.add("outside");
      if (!inRange) {
        cell.classList.add("disabled");
        cell.disabled = true;
      } else {
        cell.addEventListener("click", () => {
          if (selectedDates.has(dateStr)) {
            selectedDates.delete(dateStr);
            cell.classList.remove("selected");
          } else {
            selectedDates.add(dateStr);
            cell.classList.add("selected");
          }
          updateStaffCalendarToggle();
        });
      }

      if (selectedDates.has(dateStr)) {
        cell.classList.add("selected");
      }

      calendarEl.appendChild(cell);
    }
  };

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener("click", () => {
      const prevMonth = new Date(view.year, view.month - 1, 1);
      view.year = prevMonth.getFullYear();
      view.month = prevMonth.getMonth();
      renderStaffCalendar();
    });

    nextBtn.addEventListener("click", () => {
      const nextMonth = new Date(view.year, view.month + 1, 1);
      if (nextMonth <= new Date(todayStr)) {
        view.year = nextMonth.getFullYear();
        view.month = nextMonth.getMonth();
        renderStaffCalendar();
      }
    });
  }

  if (calendarToggle && calendarPanel) {
    calendarToggle.addEventListener("click", () => {
      const isOpen = !calendarPanel.hasAttribute("hidden");
      if (isOpen) {
        calendarPanel.setAttribute("hidden", "");
      } else {
        calendarPanel.removeAttribute("hidden");
      }
    });
  }

  const { data: categories, error: catErr } = await loadCategoriesForStudio(studioId);
  if (catErr?.message) {
    setError(catErr.message);
  }

  if (categorySelect) {
    if (!categories.length) {
      categorySelect.innerHTML = '<option value="">No categories yet</option>';
      categorySelect.disabled = true;
    } else {
      categorySelect.disabled = false;
      categorySelect.innerHTML = '<option value="">Select category</option>';
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        categorySelect.appendChild(opt);
      });
    }
  }

  const { data: students, error: studentErr } = await loadStudentsForStudio(studioId);
  if (studentErr?.message) {
    setError(studentErr.message);
  }

  if (studentSelect) {
    if (!students.length) {
      studentSelect.innerHTML = '<option value="">No students found</option>';
      studentSelect.disabled = true;
    } else {
      studentSelect.disabled = false;
      studentSelect.innerHTML = '';
      students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
        opt.textContent = name;
        studentSelect.appendChild(opt);
      });
    }
  }

  const canSubmit = !catErr && !studentErr && categories.length > 0 && students.length > 0;
  if (submitBtn) submitBtn.disabled = !canSubmit;

  renderStaffCalendar();
  updateStaffCalendarToggle();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!categorySelect || !studentSelect || !pointsInput) return;

    const category = categorySelect.value;
    const points = Number(pointsInput.value);
    const notes = notesInput?.value?.trim() || '';
    const dates = Array.from(selectedDates);
    const studentIds = Array.from(studentSelect.selectedOptions).map(o => o.value);

    if (!category || !studentIds.length || !dates.length || !Number.isFinite(points)) {
      showToast("Couldn't submit points");
      return;
    }

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
      showToast("Couldn't submit points");
      return;
    }

    if (msgEl) {
      msgEl.textContent = `Logged ${baseRows.length} entries`;
      msgEl.style.display = 'block';
      msgEl.style.color = '#0b7a3a';
    }
    showToast("✅ Points submitted");
  });
}
