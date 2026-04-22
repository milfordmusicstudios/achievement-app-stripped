import { supabase, getSupabaseClient } from "./supabaseClient.js";
import { getActiveProfileId, setActiveProfileId } from "./active-profile.js";

export async function getAuthUserId() {
  let client;
  try {
    client = getSupabaseClient();
  } catch (err) {
    console.warn("[Auth] supabase client unavailable", err);
    return null;
  }
  const { data: authData, error } = await client.auth.getUser();
  if (error) return null;
  return authData?.user?.id || null;
}

export function parseRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(r => String(r).toLowerCase());
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map(r => String(r).toLowerCase())
        : [String(parsed).toLowerCase()];
    } catch {
      return raw.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [String(raw).toLowerCase()];
}

const STUDENT_HOME_CATEGORY_DEFAULTS = Object.freeze({
  practice: 5,
  participation: 50,
  performance: 100,
  personal: 5,
  proficiency: 50
});

export function getCategoryDefaultPoints(categoryName, categoryRow = null) {
  const normalized = String(categoryName || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "practice") return 5;

  if (categoryRow && typeof categoryRow === "object") {
    const candidateKeys = ["default_points", "defaultPoints", "points", "point_value", "pointValue", "value"];
    for (const key of candidateKeys) {
      const value = Number(categoryRow[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }

  return Number.isFinite(STUDENT_HOME_CATEGORY_DEFAULTS[normalized])
    ? STUDENT_HOME_CATEGORY_DEFAULTS[normalized]
    : null;
}

export async function clearAppSessionCache(reason = "unknown") {
  const keysToRemove = [
    "aa_active_profile_id",
    "activeStudioId",
    "activeStudioRoles",
    "activeRole",
    "activeStudentId",
    "loggedInUser",
    "allUsers",
    "pendingInviteToken",
    "pendingInviteStudioId",
    "pendingInviteEmail",
    "pendingInviteRoleHint",
    "pendingChildren",
    "pendingChildrenEmail"
  ];

  keysToRemove.forEach(key => localStorage.removeItem(key));

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith("aa.activeStudent.")) {
      localStorage.removeItem(key);
    }
  }

  sessionStorage.removeItem("invite_accept_attempted");
  sessionStorage.removeItem("forceUserSwitch");

  if ("caches" in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    } catch (err) {
      console.warn("[Cache] failed to clear storage cache", err);
    }
  }

  console.log(`[Cache] cleared ${reason}`);
}

const AUTH_PAGES = new Set(["login.html", "signup.html", "forgot-password.html", "info.html", "info"]);
const REDIRECT_KEY = "didRedirectToLogin";
let didWarnRedirect = false;

function getCurrentPageName() {
  if (typeof location === "undefined") return "";
  const raw = location.pathname || "";
  return (raw.split("/").pop() || "").toLowerCase();
}

function warnRedirectOnce() {
  if (didWarnRedirect) return;
  console.warn("[ViewerContext] no auth user; redirecting to login");
  didWarnRedirect = true;
}

function attemptRedirectToLogin(isAuthPage) {
  if (isAuthPage) return false;
  if (typeof sessionStorage === "undefined") {
    window.location.href = "login.html";
    return true;
  }
  if (sessionStorage.getItem(REDIRECT_KEY)) {
    return false;
  }
  sessionStorage.setItem(REDIRECT_KEY, "1");
  window.location.href = "login.html";
  return true;
}

function clearRedirectFlag() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(REDIRECT_KEY);
}

export async function getViewerContext() {
  let client;
  try {
    client = getSupabaseClient();
  } catch (err) {
    console.error("[ViewerContext] supabase client unavailable", err);
    const currentPage = getCurrentPageName();
    attemptRedirectToLogin(AUTH_PAGES.has(currentPage));
    return {
      viewerUserId: null,
      viewerRoles: [],
      accountRoles: [],
      isAdmin: false,
      isTeacher: false,
      isStudent: false,
      isParent: false,
      accountIsOwner: false,
      accountIsAdmin: false,
      accountIsTeacher: false,
      accountIsStudent: false,
      accountIsParent: false,
      mode: "unknown",
      studioId: null,
      activeProfileId: null,
      userRow: null
    };
  }

  const { data: sessionData } = await client.auth.getSession();
  const viewerUserId = sessionData?.session?.user?.id || null;

  const currentPage = getCurrentPageName();
  const isAuthPage = AUTH_PAGES.has(currentPage);
  if (!viewerUserId) {
    warnRedirectOnce();
    attemptRedirectToLogin(isAuthPage);
    return {
      viewerUserId: null,
      viewerRoles: [],
      accountRoles: [],
      isAdmin: false,
      isTeacher: false,
      isStudent: false,
      isParent: false,
      accountIsOwner: false,
      accountIsAdmin: false,
      accountIsTeacher: false,
      accountIsStudent: false,
      accountIsParent: false,
      mode: "unknown",
      studioId: null,
      activeProfileId: null,
      userRow: null
    };
  }

  clearRedirectFlag();
  let studioId = localStorage.getItem("activeStudioId");
  if (!studioId) {
    studioId = await getActiveStudioIdForUser(viewerUserId);
  }

  const storedProfileId = getActiveProfileId();
  const requestedProfileId = storedProfileId || viewerUserId;

  let accountProfile = null;
  try {
    const { data, error } = await client
      .from("users")
      .select("id, roles, studio_id")
      .eq("id", viewerUserId)
      .single();
    if (error) throw error;
    accountProfile = data || null;
  } catch (err) {
    console.warn("[ViewerContext] auth account lookup failed", err, { table: "users", userId: viewerUserId });
  }

  const accountIdentityRoles = parseRoles(accountProfile?.roles);
  let membershipRoles = [];
  if (studioId) {
    try {
      const { data: membership, error: membershipError } = await client
        .from("studio_members")
        .select("roles")
        .eq("user_id", viewerUserId)
        .eq("studio_id", studioId)
        .maybeSingle();
      if (!membershipError) {
        membershipRoles = parseRoles(membership?.roles);
      }
    } catch (err) {
      console.warn("[ViewerContext] studio membership lookup failed", err, { table: "studio_members", userId: viewerUserId, studioId });
    }
  }

  let viewerProfile = accountProfile;
  if (requestedProfileId && String(requestedProfileId) !== String(viewerUserId)) {
    try {
      const { data: candidateProfile, error: candidateError } = await client
        .from("users")
        .select("id, roles, studio_id, parent_uuid")
        .eq("id", requestedProfileId)
        .maybeSingle();
      if (candidateError) throw candidateError;

      const candidateRoles = parseRoles(candidateProfile?.roles);
      const candidateStudioId = String(candidateProfile?.studio_id || studioId || "").trim();
      const candidateIsStudent = candidateRoles.includes("student");
      const candidateIsDirectChild = candidateIsStudent
        && String(candidateProfile?.parent_uuid || "") === String(viewerUserId);
      let candidateIsLinkedChild = false;
      if (candidateIsStudent && !candidateIsDirectChild && candidateStudioId) {
        try {
          const { data: linkRow, error: linkError } = await client
            .from("parent_student_links")
            .select("student_id")
            .eq("parent_id", viewerUserId)
            .eq("student_id", requestedProfileId)
            .eq("studio_id", candidateStudioId)
            .maybeSingle();
          if (!linkError && linkRow?.student_id) candidateIsLinkedChild = true;
        } catch (linkErr) {
          console.warn("[ViewerContext] parent_student_links active profile lookup failed", linkErr, { userId: requestedProfileId });
        }
      }
      const accountCanViewStudioStudent = candidateIsStudent
        && candidateStudioId
        && String(candidateStudioId) === String(studioId || candidateStudioId)
        && Array.from(new Set([...accountIdentityRoles, ...membershipRoles]))
          .some((role) => ["owner", "admin", "teacher"].includes(role));

      if (candidateIsDirectChild || candidateIsLinkedChild || accountCanViewStudioStudent) {
        viewerProfile = candidateProfile;
      } else {
        setActiveProfileId(viewerUserId);
        localStorage.removeItem("aa.activeStudentId");
      }
    } catch (err) {
      console.warn("[ViewerContext] active profile lookup failed", err, { table: "users", userId: requestedProfileId });
      setActiveProfileId(viewerUserId);
      localStorage.removeItem("aa.activeStudentId");
    }
  }

  if (!studioId && viewerProfile?.studio_id) {
    studioId = viewerProfile.studio_id;
    localStorage.setItem("activeStudioId", studioId);
  }

  const profileIdentityRoles = parseRoles(viewerProfile?.roles);
  const accountRoles = Array.from(new Set([...accountIdentityRoles, ...membershipRoles]));
  const isViewerAccountProfile = String(viewerProfile?.id || viewerUserId) === String(viewerUserId);
  const viewerRoles = isViewerAccountProfile
    ? accountRoles
    : Array.from(new Set(profileIdentityRoles));
  localStorage.setItem("activeStudioRoles", JSON.stringify(membershipRoles));

  const accountIsOwner = accountRoles.includes("owner");
  const accountIsAdmin = accountRoles.includes("admin");
  const accountIsTeacher = accountRoles.includes("teacher");
  const accountIsStudent = accountRoles.includes("student");
  const accountIsParent = accountRoles.includes("parent");
  const isOwner = viewerRoles.includes("owner");
  const isAdmin = viewerRoles.includes("admin");
  const isTeacher = viewerRoles.includes("teacher");
  const isStudent = viewerRoles.includes("student");
  const isParent = viewerRoles.includes("parent");
  const effectiveRole = isOwner
    ? "owner"
    : isAdmin
      ? "admin"
      : isTeacher
        ? "teacher"
        : isStudent
          ? "student"
          : isParent
            ? "parent"
            : "unknown";

  let mode = "unknown";
  if (effectiveRole === "owner" || effectiveRole === "admin" || effectiveRole === "teacher") mode = "staff";
  else if (isStudent) mode = "student";
  else if (isParent) mode = "parent";

  let activeProfileId = viewerProfile?.id || viewerUserId;
  if (!storedProfileId && mode === "parent" && !isStudent && !isTeacher && !isAdmin) {
    activeProfileId = null;
  } else if (!storedProfileId && activeProfileId) {
    setActiveProfileId(activeProfileId);
  }

  let userRow = null;
  try {
    const { data: row, error: rowError } = await client
      .from("users")
      .select("id, email, firstName, lastName, avatarUrl")
      .eq("id", viewerUserId)
      .single();
    if (rowError) throw rowError;
    if (row) {
      const firstName = row.firstName ?? row.first_name ?? "";
      const lastName = row.lastName ?? row.last_name ?? "";
      const avatarUrl = row.avatarUrl ?? row.avatar_url ?? "";
      userRow = {
        ...row,
        firstName,
        lastName,
        avatarUrl
      };
    }
  } catch (err) {
    console.warn("[ViewerContext] userRow fetch failed", err, { table: "users", userId: viewerUserId });
  }

  return {
    viewerUserId,
    viewerRoles,
    accountRoles,
    isOwner,
    isAdmin,
    isTeacher,
    isStudent,
    isParent,
    accountIsOwner,
    accountIsAdmin,
    accountIsTeacher,
    accountIsStudent,
    accountIsParent,
    effectiveRole,
    mode,
    studioId,
    activeProfileId,
    userRow
  };
}

let accessFlagsCache = null;
let accessFlagsPromise = null;

function defaultAccessFlags() {
  return {
    studio_id: null,
    is_owner: false,
    is_admin: false,
    admins_can_manage_users: false,
    can_manage_users: false
  };
}

function normalizeAccessFlags(row) {
  if (!row || typeof row !== "object") return defaultAccessFlags();
  return {
    studio_id: row.studio_id || null,
    is_owner: Boolean(row.is_owner),
    is_admin: Boolean(row.is_admin),
    admins_can_manage_users: Boolean(row.admins_can_manage_users),
    can_manage_users: Boolean(row.can_manage_users)
  };
}

export async function getAccessFlags({ force = false } = {}) {
  if (!force && accessFlagsCache) return accessFlagsCache;
  if (!force && accessFlagsPromise) return accessFlagsPromise;

  accessFlagsPromise = (async () => {
    let client;
    try {
      client = getSupabaseClient();
    } catch (err) {
      console.warn("[AccessFlags] supabase client unavailable", err);
      return defaultAccessFlags();
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData?.session?.user?.id) {
      if (sessionError) console.warn("[AccessFlags] session lookup failed", sessionError);
      return defaultAccessFlags();
    }

    const { data, error } = await client.rpc("get_my_access_flags");
    if (error) {
      console.error("[AccessFlags] get_my_access_flags failed", error, JSON.stringify(error, null, 2));
      return defaultAccessFlags();
    }

    const row = Array.isArray(data) ? data[0] : data;
    const flags = normalizeAccessFlags(row);
    if (flags.studio_id) {
      localStorage.setItem("activeStudioId", flags.studio_id);
    }
    accessFlagsCache = flags;
    return flags;
  })();

  try {
    return await accessFlagsPromise;
  } finally {
    accessFlagsPromise = null;
  }
}

export async function renderActiveStudentHeader(options = {}) {
  const {
    mountId = "activeStudentHeader",
    contentSelector = ".student-content",
    useHomeHeader = false,
    nameTemplate,
    reloadTo = null,
    skipMenu = false
  } = options;

  const mount = document.getElementById(mountId);
  if (!mount && !useHomeHeader) return { blocked: false };

  const { data: sessionData } = await supabase.auth.getSession();
  const authUserId = sessionData?.session?.user?.id || null;
  if (!authUserId) return { blocked: false };

  const { data: authProfile } = await supabase
    .from("users")
    .select("roles, studio_id")
    .eq("id", authUserId)
    .single();

  const viewerContext = await getViewerContext();
  const authRoles = parseRoles(authProfile?.roles).filter(role => role !== "admin" && role !== "owner");
  const isParentContainer = authRoles.includes("parent")
    && !authRoles.includes("student")
    && !authRoles.includes("teacher")
    && !viewerContext?.isAdmin;
  const studioId = viewerContext?.studioId || authProfile?.studio_id || null;

  const storedProfileId = localStorage.getItem("aa.activeStudentId") || getActiveProfileId();
  const hasSelectedStudent = storedProfileId && String(storedProfileId) !== String(authUserId);

  const loadLinkedStudents = async () => {
    let query = supabase
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", authUserId);
    if (studioId) query = query.eq("studio_id", studioId);
    const { data: links, error } = await query;
    if (error) {
      console.error("[Header] parent_student_links fetch failed", error);
      return [];
    }
    const ids = (links || []).map(l => l.student_id).filter(Boolean);
    if (!ids.length) return [];
    const { data: students, error: studentErr } = await supabase
      .from("users")
      .select("id, firstName, lastName, avatarUrl, roles, level")
      .in("id", ids)
      .order("lastName", { ascending: true })
      .order("firstName", { ascending: true });
    if (studentErr) {
      console.error("[Header] student lookup failed", studentErr);
      return [];
    }
    return Array.isArray(students) ? students : [];
  };

  if (isParentContainer && !hasSelectedStudent) {
    const linked = await loadLinkedStudents();
    const contentEls = document.querySelectorAll(contentSelector);
    contentEls.forEach(el => el.style.display = "none");

    if (linked.length === 1) {
      const studentId = linked[0]?.id;
      if (studentId && String(getActiveProfileId() || "") !== String(studentId)) {
        localStorage.setItem("aa.activeStudentId", String(studentId));
        setActiveProfileId(studentId);
        if (reloadTo) window.location.href = reloadTo;
        else window.location.reload();
        return { blocked: true };
      }
    }

    if (mount) {
      if (linked.length === 0) {
        mount.innerHTML = `
          <div class="active-student-header active-student-empty">
            <div class="active-student-name">No students yet. Go to Family to add one.</div>
            <a class="nav-btn" href="settings-family.html">Family</a>
          </div>
        `;
      } else {
        const optionsHtml = linked.map(s => {
          const label = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "Student";
          return `<option value="${s.id}">${label}</option>`;
        }).join("");
        mount.innerHTML = `
          <div class="active-student-header active-student-select">
            <div class="active-student-name">Select a student</div>
            <select id="activeStudentSelect">
              <option value="">Choose a student</option>
              ${optionsHtml}
            </select>
            <a class="nav-btn" href="settings-family.html">Family</a>
          </div>
        `;
        const select = document.getElementById("activeStudentSelect");
        if (select) {
          select.addEventListener("change", () => {
            const value = select.value;
            if (!value) return;
            if (studioId && authUserId) {
              localStorage.setItem(`aa.activeStudent.${studioId}.${authUserId}`, value);
            }
            localStorage.setItem("aa.activeStudentId", String(value));
            setActiveProfileId(value);
            if (reloadTo) window.location.href = reloadTo;
            else window.location.reload();
          });
        }
      }
    }
    return { blocked: true };
  }

  const activeStudentId = hasSelectedStudent
    ? storedProfileId
    : (isParentContainer ? null : (storedProfileId || viewerContext?.activeProfileId || null));

  if (!activeStudentId) return { blocked: true };

  const { data: studentProfile } = await supabase
    .from("users")
    .select("id, firstName, lastName, avatarUrl, level")
    .eq("id", activeStudentId)
    .single();

  if (studentProfile) {
    localStorage.setItem("loggedInUser", JSON.stringify(studentProfile));
  }
  localStorage.setItem("aa.activeStudentId", String(activeStudentId));

  const { data: logs } = await supabase
    .from("logs")
    .select("points")
    .eq("userId", activeStudentId)
    .eq("status", "approved");
  const totalPoints = (logs || []).reduce((sum, log) => sum + (log.points || 0), 0);
  const { data: levels } = await supabase
    .from("levels")
    .select("*")
    .order("minPoints", { ascending: true });
  const currentLevel =
    (levels || []).find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints)
    || (levels || [])[levels?.length - 1]
    || null;

  const badgeSrc = currentLevel?.badge
    || (currentLevel?.id ? `images/levelBadges/level${currentLevel.id}.png` : null)
    || "images/levelBadges/level1.png";

  const fullName = `${studentProfile?.firstName ?? ""} ${studentProfile?.lastName ?? ""}`.trim() || "Student";
  const nameText = typeof nameTemplate === "function" ? nameTemplate(studentProfile) : fullName;

  if (useHomeHeader) {
    const nameEl = document.getElementById("welcomeText");
    const avatarImg = document.getElementById("avatarImg");
    const badgeImg = document.getElementById("levelBadgeImg");
    if (nameEl) nameEl.textContent = nameText;
    if (avatarImg) {
      avatarImg.src = studentProfile?.avatarUrl || "images/icons/default.png";
    }
    if (badgeImg) badgeImg.src = badgeSrc;
    return { blocked: false, activeStudentId };
  }

  if (mount) {
    mount.innerHTML = `
      <div class="active-student-header">
        <div class="active-student-left">
          <button id="activeStudentAvatarBtn" class="avatar-button" type="button" aria-haspopup="menu" aria-expanded="false">
            <img id="activeStudentAvatarImg" src="${studentProfile?.avatarUrl || "images/icons/default.png"}" alt="Avatar">
          </button>
          <div id="activeStudentMenu" class="avatar-menu" role="menu" hidden></div>
        </div>
        <div class="active-student-center">
          <div id="activeStudentName" class="active-student-name">${nameText}</div>
        </div>
        <div class="active-student-right">
          <img id="activeStudentBadge" class="active-student-badge" src="${badgeSrc}" alt="Level badge">
        </div>
      </div>
    `;
  }

  const avatarBtn = document.getElementById("activeStudentAvatarBtn");
  const avatarMenu = document.getElementById("activeStudentMenu");
  const linkedStudents = authRoles.includes("parent") ? await loadLinkedStudents() : [];

  if (!skipMenu && avatarBtn && avatarMenu && linkedStudents.length > 1) {
    avatarMenu.innerHTML = "";
    linkedStudents.forEach(student => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "avatar-menu-item";
      if (String(student.id) === String(activeStudentId)) {
        item.classList.add("is-active");
        item.setAttribute("aria-current", "true");
      }
      const img = document.createElement("img");
      img.src = student.avatarUrl || "images/icons/default.png";
      img.alt = "";
      const label = document.createElement("span");
      label.textContent = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "Student";
      item.appendChild(img);
      item.appendChild(label);
      item.addEventListener("click", () => {
        if (studioId && authUserId) {
          localStorage.setItem(`aa.activeStudent.${studioId}.${authUserId}`, student.id);
        }
        localStorage.setItem("aa.activeStudentId", String(student.id));
        setActiveProfileId(student.id);
        if (reloadTo) window.location.href = reloadTo;
        else window.location.reload();
      });
      avatarMenu.appendChild(item);
    });

    avatarBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const isOpen = !avatarMenu.hidden;
      avatarMenu.hidden = isOpen;
      avatarBtn.setAttribute("aria-expanded", String(!isOpen));
    });

    document.addEventListener("click", (e) => {
      if (!avatarMenu.hidden && !avatarMenu.contains(e.target) && !avatarBtn.contains(e.target)) {
        avatarMenu.hidden = true;
        avatarBtn.setAttribute("aria-expanded", "false");
      }
    });
  } else if (avatarBtn) {
    avatarBtn.setAttribute("aria-expanded", "false");
  }

  const contentEls = document.querySelectorAll(contentSelector);
  contentEls.forEach(el => el.style.display = "");

  return { blocked: false, activeStudentId };
}

export async function getActiveStudentId() {
  const rolesRaw = localStorage.getItem("activeStudioRoles");
  let roles = [];
  try {
    roles = JSON.parse(rolesRaw || "[]");
  } catch {
    roles = [];
  }

  const hasParent = Array.isArray(roles) && roles.includes("parent");
  const hasStudent = Array.isArray(roles) && roles.includes("student");
  const selectedStorageId = localStorage.getItem("aa.activeStudentId") || getActiveProfileId() || null;
  if (hasParent && !hasStudent) {
    const selector = document.getElementById("parentStudentSelect");
    const selectedId = selector?.value
      || selectedStorageId
      || JSON.parse(localStorage.getItem("loggedInUser") || "null")?.id
      || null;
    if (selectedId) {
      localStorage.setItem("aa.activeStudentId", String(selectedId));
    }
    return selectedId ? String(selectedId) : null;
  }
  return selectedStorageId ? String(selectedStorageId) : null;
}

export async function getStudioRolesForActiveStudio() {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) return [];

  let activeStudioId = localStorage.getItem("activeStudioId");
  if (!activeStudioId) {
    const { data: memberships } = await supabase
      .from("studio_members")
      .select("studio_id")
      .eq("user_id", authUser.id);
    if (memberships?.length === 1) {
      activeStudioId = memberships[0].studio_id;
      localStorage.setItem("activeStudioId", activeStudioId);
    }
  }

  if (!activeStudioId) return [];

  const { data: member, error } = await supabase
    .from("studio_members")
    .select("roles")
    .eq("user_id", authUser.id)
    .eq("studio_id", activeStudioId)
    .maybeSingle();

  if (error) {
    console.error("[AuthZ] studio role lookup failed", error);
    return [];
  }

  const roles = Array.isArray(member?.roles) ? member.roles : [];
  localStorage.setItem("activeStudioRoles", JSON.stringify(roles));
  return roles;
}

export async function requireRole(requiredRoles, options = {}) {
  const roles = await getStudioRolesForActiveStudio();
  const required = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  const ok = required.some(r => roles.includes(r));
  const studioId = localStorage.getItem("activeStudioId");

  if (!ok) {
    const msg = options?.message || "Access denied. Admins only.";
    alert(msg);
    window.location.href = "index.html";
  }

  return { ok, roles, studioId };
}

export async function getActiveStudioIdForUser(authUserId) {
  let activeStudioId = localStorage.getItem("activeStudioId");
  if (!activeStudioId && authUserId) {
    const { data: memberships } = await supabase
      .from("studio_members")
      .select("studio_id")
      .eq("user_id", authUserId);
    if (memberships?.length === 1) {
      activeStudioId = memberships[0].studio_id;
      localStorage.setItem("activeStudioId", activeStudioId);
    }
  }
  return activeStudioId || null;
}

export async function getStudioRoles(authUserId, studioId) {
  if (!authUserId || !studioId) return [];
  const { data: member, error } = await supabase
    .from("studio_members")
    .select("roles")
    .eq("user_id", authUserId)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (error) {
    console.error("[AuthZ] studio role lookup failed", error);
    return [];
  }

  const roles = Array.isArray(member?.roles) ? member.roles : [];
  localStorage.setItem("activeStudioRoles", JSON.stringify(roles));
  return roles;
}

export async function requireStudioRoles(requiredRoles, redirectTo = "index.html") {
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData?.user?.id || null;
  const studioId = await getActiveStudioIdForUser(authUserId);
  const roles = await getStudioRoles(authUserId, studioId);
  const required = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  const ok = required.some(r => roles.includes(r));

  if (!ok) {
    alert("Access denied.");
    window.location.href = redirectTo;
    return { ok: false, roles, studioId };
  }

  return { ok: true, roles, studioId };
}

export async function ensureUserRow() {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) return null;

  if (!getActiveProfileId()) {
    setActiveProfileId(authUser.id);
  }

  const payload = {
    id: authUser.id,
    email: authUser.email,
    active: true
  };

  const { error: upsertError } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "id" });

  if (upsertError) {
    console.error("[UserRow] upsert failed:", upsertError);
    return null;
  }

  const profileId = getActiveProfileId() || authUser.id;
  let { data: row, error: selectError } = await supabase
    .from("users")
    .select("*")
    .eq("id", profileId)
    .single();

  if (selectError) {
    console.error("[UserRow] select failed:", selectError);
    if (profileId !== authUser.id) {
      const { data: fallbackRow } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();
      if (fallbackRow) {
        setActiveProfileId(authUser.id);
        row = fallbackRow;
      }
    }
    if (!row) return null;
  }

  console.log("[UserRow] ensured id/email", authUser.id, authUser.email);
  return row || null;
}

// ✅ Helper: Popup for level-up event
function showLevelUpPopup(userName, newLevelName) {
  console.log("[DEBUG] Showing Level-Up popup for:", userName, newLevelName);

  setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.style = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex; justify-content: center; align-items: center;
      z-index: 999999;
    `;

    overlay.innerHTML = `
      <div style="
        background: white;
        padding: 30px;
        border-radius: 14px;
        text-align: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        max-width: 340px;
        animation: fadeIn 0.3s ease;
      ">
        <h2 style="color:#00477d; margin-bottom:10px;">🎉 Level Up!</h2>
        <p>${userName} just reached <b>${newLevelName}</b>!</p>
        <button id="closeLevelUpPopup" class="blue-button" style="margin-top:15px;">OK</button>
      </div>
    `;

    document.body.appendChild(overlay);
    const closeBtn = document.getElementById('closeLevelUpPopup');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  }, 1500);
}

export async function recalculateUserPoints(userId) {
  try {
    const { data: userBefore, error: beforeErr } = await supabase
      .from('users')
      .select('points, level, firstName, lastName, roles, studio_id, teacherIds')
      .eq('id', userId)
      .single();
    if (beforeErr) throw beforeErr;

    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('*')
      .eq('userId', userId)
      .eq('status', 'approved');
    if (logsError) throw logsError;

    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);

    const { data: levels, error: levelsError } = await supabase
      .from('levels')
      .select('*')
      .order('minPoints', { ascending: true });
    if (levelsError) throw levelsError;

    const currentLevel =
      levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) ||
      levels[levels.length - 1];

    const { error: updateError } = await supabase
      .from('users')
      .update({ points: totalPoints, level: currentLevel.id })
      .eq('id', userId);
    if (updateError) throw updateError;

    const loggedIn = JSON.parse(localStorage.getItem('loggedInUser'));
    let previousLevel = userBefore?.level;
    if (loggedIn && loggedIn.id === userId && loggedIn.level) {
      previousLevel = loggedIn.level;
    }
    const newLevel = Number(currentLevel?.id || 0);
    const didLevelUp = newLevel > Number(previousLevel || 0);
    console.log("[LevelUpDiag][utils.js][recalculateUserPoints] level-check", {
      studentUserId: String(userId || "").trim() || null,
      studioId: String(userBefore?.studio_id || localStorage.getItem("activeStudioId") || "").trim() || null,
      previousLevel: Number(previousLevel || 0),
      newLevel,
      didLevelUp
    });

    if (didLevelUp) {
      const fullName = `${userBefore.firstName || ''} ${userBefore.lastName || ''}`.trim();
      let studioId = String(userBefore?.studio_id || localStorage.getItem("activeStudioId") || "").trim() || null;
      if (!studioId) {
        const { data: membershipRows, error: membershipErr } = await supabase
          .from("studio_members")
          .select("studio_id")
          .eq("user_id", userId)
          .limit(1);
        if (membershipErr) {
          console.warn("[Notifications] studio lookup failed for level-up", membershipErr);
        } else {
          const fallbackStudioId = String(membershipRows?.[0]?.studio_id || "").trim();
          studioId = fallbackStudioId || null;
        }
      }
      const previousLevelNumber = Number(previousLevel || 0);
      const levelsToNotify = [];
      for (let level = previousLevelNumber + 1; level <= newLevel; level += 1) {
        levelsToNotify.push(level);
      }
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = String(sessionData?.session?.access_token || "").trim();
        const headers = { "Content-Type": "application/json" };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const requestUrl = "/api/notifications/level-up";
        const requestMethod = "POST";
        for (const level of levelsToNotify) {
          const requestBody = {
            studioId,
            studentUserId: String(userId || "").trim(),
            studentName: fullName || "Student",
            level
          };
          console.log("[LevelUpDiag][utils.js][recalculateUserPoints] notification-api request", {
            requestUrl,
            method: requestMethod,
            body: requestBody
          });
          const response = await fetch(requestUrl, {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify(requestBody)
          });
          const responseBody = await response.json().catch(() => ({}));
          console.log("[LevelUpDiag][utils.js][recalculateUserPoints] notification-api response", {
            requestUrl,
            method: requestMethod,
            status: response.status,
            body: responseBody
          });
          if (!response.ok) {
            console.warn("[Notifications] level-up API failed", {
              status: response.status,
              error: responseBody?.error || null
            });
          }
        }
      } catch (apiErr) {
        console.warn("[Notifications] level-up API request error", apiErr);
      }

      if (loggedIn && loggedIn.id === userId && loggedIn.roles?.includes('student')) {
        showLevelUpPopup(fullName, currentLevel.name || `Level ${currentLevel.id}`);
        loggedIn.level = currentLevel.id;
        localStorage.setItem('loggedInUser', JSON.stringify(loggedIn));
      }
    }

    console.log(`[DEBUG] Updated ${userId}: ${totalPoints} pts, Level ${currentLevel.id}`);
    return { totalPoints, currentLevel };
  } catch (err) {
    console.error('[ERROR] Recalculate failed:', err);
    return null;
  }
}
