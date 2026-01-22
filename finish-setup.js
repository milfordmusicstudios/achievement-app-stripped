import { supabase } from "./supabaseClient.js";
import { ensureUserRow } from "./utils.js";
import { ensureStudioContextAndRoute } from "./studio-routing.js";

function showError(message) {
  const errorEl = document.getElementById("finishSetupError");
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function showMessage(message) {
  const msgEl = document.getElementById("finishSetupMsg");
  if (!msgEl) return;
  msgEl.textContent = message;
  msgEl.style.display = "block";
}

function clearMessages() {
  const errorEl = document.getElementById("finishSetupError");
  const msgEl = document.getElementById("finishSetupMsg");
  const passwordStatus = document.getElementById("passwordStatus");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  if (msgEl) {
    msgEl.textContent = "";
    msgEl.style.display = "none";
  }
  if (passwordStatus) {
    passwordStatus.textContent = "";
    passwordStatus.style.display = "none";
    passwordStatus.style.color = "";
  }
}

function safeParseJSON(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseInstruments(raw) {
  return (raw || "")
    .split(",")
    .map(i => i.trim())
    .filter(Boolean);
}

function parseRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.map(r => String(r).toLowerCase());
  if (typeof roles === "string") {
    try {
      const parsed = JSON.parse(roles);
      return Array.isArray(parsed) ? parsed.map(r => String(r).toLowerCase()) : [String(parsed).toLowerCase()];
    } catch {
      return roles.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [String(roles).toLowerCase()];
}

let teacherOptionData = [];
let inviteContext = null;
let isStaffInvite = false;
let teacherListMessage = "";

function applyTeacherOptionsToSelect(selectEl) {
  if (!selectEl) return;
  if (teacherOptionData.length === 0) {
    selectEl.innerHTML = "";
    selectEl.disabled = true;
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = teacherListMessage || "No teachers found for this studio. Ask an admin to add teachers.";
    selectEl.appendChild(opt);
    return;
  }
  const selected = new Set(Array.from(selectEl.selectedOptions || []).map(o => o.value));
  selectEl.innerHTML = "";
  teacherOptionData.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    if (selected.has(t.id)) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function setTeacherError(row, message) {
  const errorEl = row.querySelector(".teacher-error");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

async function loadTeachersForStudio(studioId) {
  console.log("[FinishSetup] studioId for teacher load", studioId);
  const { data, error } = await supabase
    .from("users")
    .select('id, "firstName", "lastName", roles')
    .eq("studio_id", studioId)
    .contains("roles", ["teacher"])
    .order("lastName", { ascending: true })
    .order("firstName", { ascending: true });

  if (error) {
    console.error("[FinishSetup] teacher load error", error);
    teacherListMessage = "No teachers found for this studio. Ask an admin to add teachers.";
    teacherOptionData = [];
    return;
  }

  console.log("[FinishSetup] teachers found", (data || []).length, data);
  teacherOptionData = (data || []).map(t => ({
    id: t.id,
    label: (`${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() || t.id)
  }));

  if ((data || []).length === 0) {
    const { data: anyUsers, error: anyErr } = await supabase
      .from("users")
      .select("id")
      .eq("studio_id", studioId)
      .limit(1);
    console.log("[FinishSetup] RLS probe anyUsers length", (anyUsers || []).length, anyErr);
    if (!anyErr && (!anyUsers || anyUsers.length === 0)) {
      teacherListMessage = "No teachers found (or access is blocked by security rules). Ask an admin to run the teacher-list RLS policy.";
    } else {
      teacherListMessage = "No teachers found for this studio. Ask an admin to add teachers.";
    }
  }
}

async function resolveInviteContext(token) {
  if (!token) return null;
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  console.log("[FinishSetup] accept_invite result", { data, error });
  if (error || !data?.ok) {
    return { ok: false, error: error?.message || data?.error || "Invite not accepted" };
  }
  const storedHint = localStorage.getItem("pendingInviteRoleHint");
  const roleHint = data?.role_hint || data?.role || storedHint || null;
  const roles = normalizeRoles(data?.roles || roleHint);
  return {
    ok: true,
    studioId: data.studio_id,
    invitedRole: roleHint,
    roles
  };
}

function getAccountType() {
  const selected = document.querySelector('input[name="accountType"]:checked');
  return selected?.value || "parent";
}

function setStudentsVisible(visible) {
  const section = document.getElementById("studentsSection");
  if (section) section.style.display = visible ? "" : "none";
}

function collectStudentRows() {
  const rows = Array.from(document.querySelectorAll("#studentsList .student-block"));
  return rows.map(row => {
    const firstName = (row.querySelector(".student-first")?.value || "").trim();
    const lastName = (row.querySelector(".student-last")?.value || "").trim();
    const grade = (row.querySelector(".student-grade")?.value || "").trim();
    const instrumentRaw = (row.querySelector(".student-instrument")?.value || "").trim();
    const teacherSelect = row.querySelector(".student-teachers");
    const teacherIds = Array.from(teacherSelect?.selectedOptions || []).map(o => o.value);
    return { row, firstName, lastName, grade, instrumentRaw, teacherIds };
  });
}

function normalizeRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(r => String(r).toLowerCase());
  if (typeof raw === "string") return raw.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
  return [];
}

function addStudentRow(initial = {}) {
  const list = document.getElementById("studentsList");
  const template = document.getElementById("studentRowTemplate");
  if (!list || !template) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = template.innerHTML.trim();
  const block = wrapper.firstElementChild;
  if (!block) return;

  const firstInput = block.querySelector(".student-first");
  const lastInput = block.querySelector(".student-last");
  const gradeInput = block.querySelector(".student-grade");
  const instrumentInput = block.querySelector(".student-instrument");
  const teacherSelect = block.querySelector(".student-teachers");
  if (firstInput) firstInput.value = initial.firstName || "";
  if (lastInput) lastInput.value = initial.lastName || "";
  if (gradeInput) gradeInput.value = initial.grade || "";
  if (instrumentInput) instrumentInput.value = initial.instrument || "";
  if (teacherSelect) {
    if (isStaffInvite) {
      const wrap = block.querySelector(".teacher-select-wrap");
      if (wrap) wrap.style.display = "none";
    }
    applyTeacherOptionsToSelect(teacherSelect);
    const selectedIds = Array.isArray(initial.teacherIds) ? initial.teacherIds.map(String) : [];
    selectedIds.forEach(id => {
      const opt = Array.from(teacherSelect.options).find(o => o.value === id);
      if (opt) opt.selected = true;
    });
    teacherSelect.addEventListener("change", () => setTeacherError(block, ""));
  }

  const removeBtn = block.querySelector(".remove-student-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      block.remove();
    });
  }

  list.appendChild(block);
}

function disableForm(disabled) {
  document.querySelectorAll("#finishSetupForm input, #finishSetupForm select, #finishSetupForm button").forEach(el => {
    el.disabled = disabled;
  });
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.disabled = false;
}

document.addEventListener("DOMContentLoaded", async () => {
  clearMessages();
  const urlToken = new URLSearchParams(location.search).get("token");
  console.log("[FinishSetup] urlToken present?", Boolean(urlToken));
  if (urlToken) {
    localStorage.setItem("pendingInviteToken", urlToken);
  }
  const storedToken = localStorage.getItem("pendingInviteToken");
  console.log("[FinishSetup] pendingInviteToken length", storedToken ? storedToken.length : 0);
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData?.session?.user) {
    const errorEl = document.getElementById("finishSetupError");
    if (errorEl) {
      errorEl.innerHTML = 'Not logged in. <a href="login.html">Go to login</a>.';
      errorEl.style.display = "block";
    }
    disableForm(true);
    return;
  }
  console.log("[FinishSetup] session ok");

  const authUser = sessionData.session.user;
  const pendingToken = storedToken;
  let inviteRoles = [];

  if (pendingToken) {
    const contextResult = await resolveInviteContext(pendingToken);
    if (!contextResult?.ok) {
      console.warn("[FinishSetup] invite not ok", contextResult?.error);
      showError("Invite could not be accepted. Please log out and try again.");
      disableForm(true);
      return;
    }

    inviteContext = contextResult;
    inviteRoles = contextResult.roles || [];
    isStaffInvite = inviteRoles.includes("teacher") || inviteRoles.includes("admin");
    localStorage.setItem("activeStudioId", contextResult.studioId);
    localStorage.setItem("activeStudioRoles", JSON.stringify(inviteRoles));
    localStorage.removeItem("pendingInviteToken");
    localStorage.removeItem("pendingInviteStudioId");
    localStorage.removeItem("pendingInviteEmail");
    localStorage.removeItem("pendingInviteRoleHint");
    console.log("[FinishSetup] invite accepted ok");

    const ensureStudioMembership = async (studioId) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) return;

      const payload = {
        studio_id: studioId,
        user_id: uid,
        created_by: uid
      };

      const { error } = await supabase
        .from("studio_members")
        .upsert(payload, { onConflict: "studio_id,user_id" });

      if (error) {
        console.warn("[FinishSetup] ensureStudioMembership failed", error);
      } else {
        console.log("[FinishSetup] ensureStudioMembership ok");
      }
    };

    await ensureStudioMembership(contextResult.studioId);
  } else {
    showError("Missing invite token. Please check your invite link.");
    disableForm(true);
    return;
  }

  const activeStudioId = inviteContext?.studioId || localStorage.getItem("activeStudioId");
  if (!activeStudioId) {
    window.location.href = "select-studio.html";
    return;
  }

  const profile = await ensureUserRow();
  if (!profile) {
    console.error("[FinishSetup] failed to load profile");
    window.location.href = "login.html";
    return;
  }
  localStorage.setItem("loggedInUser", JSON.stringify(profile));

  const firstNameInput = document.getElementById("adultFirstName");
  const lastNameInput = document.getElementById("adultLastName");
  if (firstNameInput) firstNameInput.value = profile.firstName || "";
  if (lastNameInput) lastNameInput.value = profile.lastName || "";

  document.querySelectorAll('input[name="accountType"]').forEach(radio => {
    radio.addEventListener("change", () => {
      setStudentsVisible(getAccountType() === "parent");
    });
  });
  setStudentsVisible(getAccountType() === "parent");

  await loadTeachersForStudio(activeStudioId);
  addStudentRow();
  document.getElementById("addStudentBtn")?.addEventListener("click", () => addStudentRow());

  const selfTeacherSection = document.getElementById("selfTeacherSection");
  const selfTeacherSelect = document.getElementById("selfTeacherIds");
  const selfTeacherError = document.getElementById("selfTeacherError");
  const isStudentRole = inviteRoles.includes("student");
  const isStaffRole = inviteRoles.includes("teacher") || inviteRoles.includes("admin");
  if (selfTeacherSection && selfTeacherSelect && isStudentRole && !isStaffRole) {
    selfTeacherSection.style.display = "";
    applyTeacherOptionsToSelect(selfTeacherSelect);
    selfTeacherSelect.addEventListener("change", () => {
      if (selfTeacherError) {
        selfTeacherError.textContent = "";
        selfTeacherError.style.display = "none";
      }
    });
  }

  const form = document.getElementById("finishSetupForm");
  const skipBtn = document.getElementById("skipBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const passwordInput = document.getElementById("newPassword");
  const confirmInput = document.getElementById("confirmPassword");
  const passwordStatus = document.getElementById("passwordStatus");
  const submitBtn = document.getElementById("completeSetupBtn");

  const showPasswordStatus = (message, isError = false) => {
    if (!passwordStatus) return;
    passwordStatus.textContent = message || "";
    passwordStatus.style.display = message ? "block" : "none";
    passwordStatus.style.color = isError ? "#c62828" : "#0b7a3a";
  };

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();
    if (submitBtn) submitBtn.disabled = true;

    const firstName = (firstNameInput?.value || "").trim();
    const lastName = (lastNameInput?.value || "").trim();
    if (!firstName || !lastName) {
      showError("First and last name are required.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const accountType = getAccountType();
    const preservedStaffRoles = inviteRoles.filter(r => r === "teacher" || r === "admin");
    const inviteHasPrimaryRole = inviteRoles.some(r => r === "student" || r === "teacher" || r === "admin" || r === "parent");
    const parentRole = (!inviteHasPrimaryRole && (accountType === "parent" || accountType === "adult")) ? ["parent"] : [];
    const desiredRoles = Array.from(new Set([
      ...inviteRoles,
      ...parentRole,
      ...preservedStaffRoles
    ]));

    const selfTeacherSelect = document.getElementById("selfTeacherIds");
    const selfTeacherError = document.getElementById("selfTeacherError");
    const selfTeacherIds = Array.from(selfTeacherSelect?.selectedOptions || []).map(o => o.value);
    if (desiredRoles.includes("student") && !(inviteRoles.includes("teacher") || inviteRoles.includes("admin"))) {
      if (teacherOptionData.length === 0 || selfTeacherIds.length === 0) {
        if (selfTeacherError) {
          selfTeacherError.textContent = "Select at least one teacher.";
          selfTeacherError.style.display = "block";
        }
        showError("Select at least one teacher.");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    }

    // Idempotent profile upsert prevents duplicate parent rows for the same auth user.
    const { error: updateErr } = await supabase
      .from("users")
      .upsert({
        id: authUser.id,
        email: authUser.email,
        firstName,
        lastName,
        roles: desiredRoles,
        ...(desiredRoles.includes("student") ? { teacherIds: selfTeacherIds } : {}),
        active: true
      }, { onConflict: "id" });

    if (updateErr) {
      console.error("[FinishSetup] profile save failed", updateErr);
      showError(updateErr.message || "Failed to save profile.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    console.log("[FinishSetup] profile saved");

    if (accountType === "parent") {
      // Prevent accidental parent→student duplication: only create rows for explicitly entered students.
      const rows = collectStudentRows();
      const activeRows = rows.filter(r => r.firstName || r.lastName || r.grade || r.instrumentRaw);
      const studentPayload = [];

      for (const entry of activeRows) {
        const hasFirst = Boolean(entry.firstName);
        const hasLast = Boolean(entry.lastName);
        if (hasFirst !== hasLast) {
          showError("Each student must have first and last name.");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (!crypto?.randomUUID) {
          showError("Browser does not support student creation.");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        // Only create linked students when explicit student info is provided.
        if (!hasFirst || !hasLast) continue;
        if (!isStaffInvite) {
          if (teacherOptionData.length === 0) {
            setTeacherError(entry.row, "Select at least one teacher.");
            showError("Select at least one teacher.");
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
          if (!entry.teacherIds.length) {
            setTeacherError(entry.row, "Select at least one teacher.");
            showError("Select at least one teacher.");
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
        }

        studentPayload.push({
          id: crypto.randomUUID(),
          firstName: entry.firstName,
          lastName: entry.lastName,
          roles: ["student"],
          parent_uuid: authUser.id,
          instrument: parseInstruments(entry.instrumentRaw),
          teacherIds: entry.teacherIds,
          points: 0,
          level: 1,
          active: true,
          studio_id: activeStudioId,
          showonleaderboard: true
          // TODO: No known column for grade in current schema; store if added later.
        });
      }

      if (studentPayload.length > 0) {
        const { error: insertErr } = await supabase.from("users").insert(studentPayload);
        if (insertErr) {
          console.error("[FinishSetup] student insert failed", insertErr);
          showError(insertErr.message || "Failed to create students.");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        console.log("[FinishSetup] students created", studentPayload.length);
        showMessage(`Created ${studentPayload.length} student(s).`);
      }
    }

    const refreshed = await ensureUserRow();
    if (refreshed) {
      localStorage.setItem("loggedInUser", JSON.stringify(refreshed));
    }

    const newPassword = (passwordInput?.value || "").trim();
    const confirmPassword = (confirmInput?.value || "").trim();
    if (newPassword) {
      if (newPassword.length < 8) {
        showPasswordStatus("Password must be at least 8 characters.", true);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      if (newPassword !== confirmPassword) {
        showPasswordStatus("Passwords do not match.", true);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) {
        showPasswordStatus(pwErr.message || "Failed to save password.", true);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      showPasswordStatus("Password saved.");
      if (passwordInput) passwordInput.value = "";
      if (confirmInput) confirmInput.value = "";
    }

    if (submitBtn) submitBtn.disabled = false;
    window.location.href = "index.html";
  });

  skipBtn?.addEventListener("click", async () => {
    clearMessages();
    const firstName = (firstNameInput?.value || "").trim();
    const lastName = (lastNameInput?.value || "").trim();
    if (firstName && lastName) {
      await supabase.from("users").upsert({
        id: authUser.id,
        email: authUser.email,
        firstName,
        lastName,
        roles: ["parent"],
        active: true
      }, { onConflict: "id" });
      console.log("[FinishSetup] profile saved");
    }
    window.location.href = "index.html";
  });

  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("activeStudioId");
    localStorage.removeItem("activeStudioRoles");
    localStorage.removeItem("pendingInviteToken");
    localStorage.removeItem("pendingInviteStudioId");
    localStorage.removeItem("pendingInviteEmail");
    localStorage.removeItem("pendingInviteRoleHint");
    window.location.href = "login.html";
  });
});
