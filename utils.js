import { supabase } from "./supabaseClient.js";
import { getActiveProfileId, setActiveProfileId } from "./active-profile.js";

export async function getAuthUserId() {
  const { data: authData } = await supabase.auth.getUser();
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

export async function getViewerContext() {
  const { data: sessionData } = await supabase.auth.getSession();
  const viewerUserId = sessionData?.session?.user?.id || null;

  if (!viewerUserId) {
    return {
      viewerUserId: null,
      viewerRoles: [],
      isAdmin: false,
      isTeacher: false,
      isStudent: false,
      isParent: false,
      mode: "unknown",
      studioId: null,
      activeProfileId: null,
      userRow: null
    };
  }

  let studioId = localStorage.getItem("activeStudioId");
  if (!studioId) {
    studioId = await getActiveStudioIdForUser(viewerUserId);
  }

  const storedProfileId = getActiveProfileId();
  const effectiveProfileId = storedProfileId || viewerUserId;

  let viewerProfile = null;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("roles, studio_id")
      .eq("id", effectiveProfileId)
      .single();
    if (error) throw error;
    viewerProfile = data || null;
  } catch (err) {
    console.warn("[ViewerContext] user lookup failed", err, { table: "users", userId: effectiveProfileId });
  }

  if (!viewerProfile && effectiveProfileId !== viewerUserId) {
    try {
      const { data: fallbackProfile, error: fallbackError } = await supabase
        .from("users")
        .select("roles, studio_id")
        .eq("id", viewerUserId)
        .single();
      if (!fallbackError) {
        viewerProfile = fallbackProfile || null;
        setActiveProfileId(viewerUserId);
      }
    } catch (err) {
      console.warn("[ViewerContext] fallback user lookup failed", err, { table: "users", userId: viewerUserId });
    }
  }

  if (!studioId && viewerProfile?.studio_id) {
    studioId = viewerProfile.studio_id;
    localStorage.setItem("activeStudioId", studioId);
  }

  const viewerRoles = parseRoles(viewerProfile?.roles);
  localStorage.setItem("activeStudioRoles", JSON.stringify(viewerRoles));

  const isAdmin = viewerRoles.includes("admin");
  const isTeacher = viewerRoles.includes("teacher");
  const isStudent = viewerRoles.includes("student");
  const isParent = viewerRoles.includes("parent");

  let mode = "unknown";
  if (isAdmin || isTeacher) mode = "staff";
  else if (isStudent) mode = "student";
  else if (isParent) mode = "parent";

  let activeProfileId = storedProfileId || viewerUserId;
  if (!storedProfileId && mode === "parent" && !isStudent && !isTeacher && !isAdmin) {
    activeProfileId = null;
  } else if (!storedProfileId && activeProfileId) {
    setActiveProfileId(activeProfileId);
  }

  let userRow = null;
  try {
    const { data: row, error: rowError } = await supabase
      .from("users")
      .select("id, email, firstName, lastName, avatar_url")
      .eq("id", viewerUserId)
      .single();
    if (rowError) throw rowError;
    if (row) {
      const firstName = row.firstName ?? row.first_name ?? "";
      const lastName = row.lastName ?? row.last_name ?? "";
      userRow = {
        ...row,
        firstName,
        lastName
      };
      
    }
  } catch (err) {
    console.warn("[ViewerContext] userRow fetch failed", err, { table: "users", userId: viewerUserId });
  }

  return {
    viewerUserId,
    viewerRoles,
    isAdmin,
    isTeacher,
    isStudent,
    isParent,
    mode,
    studioId,
    activeProfileId,
    userRow
  };
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

  const authRoles = parseRoles(authProfile?.roles);
  const isParentContainer = authRoles.includes("parent")
    && !authRoles.includes("student")
    && !authRoles.includes("teacher")
    && !authRoles.includes("admin");

  const viewerContext = await getViewerContext();
  const studioId = viewerContext?.studioId || authProfile?.studio_id || null;

  const storedProfileId = getActiveProfileId();
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
    : (isParentContainer ? null : (storedProfileId || authUserId));

  if (!activeStudentId) return { blocked: true };

  const { data: studentProfile } = await supabase
    .from("users")
    .select("id, firstName, lastName, avatarUrl, level")
    .eq("id", activeStudentId)
    .single();

  if (studentProfile) {
    localStorage.setItem("loggedInUser", JSON.stringify(studentProfile));
  }

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
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData?.user?.id || null;
  if (hasParent && !hasStudent) {
    const selector = document.getElementById("parentStudentSelect");
    const selectedId = selector?.value
      || localStorage.getItem("activeStudentId")
      || JSON.parse(localStorage.getItem("loggedInUser") || "null")?.id;
    return selectedId ? String(selectedId) : null;
  }
  const fallbackSelectedId = localStorage.getItem("activeStudentId");
  if (fallbackSelectedId && authUserId && String(fallbackSelectedId) !== String(authUserId)) {
    return String(fallbackSelectedId);
  }
  return authUserId;
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
    .single();

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
    .single();

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
      .select('points, level, firstName, lastName, roles')
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

    if (previousLevel !== currentLevel.id) {
      const fullName = `${userBefore.firstName || ''} ${userBefore.lastName || ''}`.trim();

      await supabase.from('notifications').insert([
        {
          userId,
          message: `${fullName} advanced to Level ${currentLevel.name || currentLevel.id}!`,
        },
      ]);

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
