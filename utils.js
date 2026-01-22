import { supabase } from "./supabaseClient.js";

export async function getAuthUserId() {
  const { data: authData } = await supabase.auth.getUser();
  return authData?.user?.id || null;
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

  const { data: row, error: selectError } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (selectError) {
    console.error("[UserRow] select failed:", selectError);
    return null;
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
