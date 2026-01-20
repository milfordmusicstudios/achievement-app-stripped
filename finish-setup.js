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
    return { row, firstName, lastName, grade, instrumentRaw };
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
  if (firstInput) firstInput.value = initial.firstName || "";
  if (lastInput) lastInput.value = initial.lastName || "";
  if (gradeInput) gradeInput.value = initial.grade || "";
  if (instrumentInput) instrumentInput.value = initial.instrument || "";

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

  if (pendingToken) {
    const { data, error } = await supabase.rpc("accept_invite", { p_token: pendingToken });
    console.log("[FinishSetup] accept_invite result", { data, error });
    if (error) {
      console.error("[FinishSetup] accept_invite failed", error);
      showError("We could not accept the invite. Please log out and try again.");
      disableForm(true);
      return;
    }
    if (!data?.ok) {
      console.warn("[FinishSetup] invite not ok", data?.error);
      showError("Invite could not be accepted. Please log out and try again.");
      disableForm(true);
      return;
    }

    localStorage.setItem("activeStudioId", data.studio_id);
    localStorage.setItem("activeStudioRoles", JSON.stringify(data.roles || []));
    localStorage.removeItem("pendingInviteToken");
    localStorage.removeItem("pendingInviteStudioId");
    localStorage.removeItem("pendingInviteEmail");
    localStorage.removeItem("pendingInviteRoleHint");
    console.log("[FinishSetup] invite accepted ok");
  } else {
    const routeResult = await ensureStudioContextAndRoute({ redirectHome: false });
    if (routeResult?.redirected) return;
  }

  const activeStudioId = localStorage.getItem("activeStudioId");
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

  addStudentRow();
  document.getElementById("addStudentBtn")?.addEventListener("click", () => addStudentRow());

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
    const storedRoles = safeParseJSON(localStorage.getItem("activeStudioRoles"), []);
    const studioRoles = normalizeRoles(storedRoles);
    const preservedStaffRoles = studioRoles.filter(r => r === "teacher" || r === "admin");
    const desiredRoles = Array.from(new Set([
      ...(accountType === "parent" || accountType === "adult" ? ["parent"] : []),
      ...preservedStaffRoles
    ]));

    // Idempotent profile upsert prevents duplicate parent rows for the same auth user.
    const { error: updateErr } = await supabase
      .from("users")
      .upsert({
        id: authUser.id,
        email: authUser.email,
        firstName,
        lastName,
        roles: desiredRoles,
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

        studentPayload.push({
          id: crypto.randomUUID(),
          firstName: entry.firstName,
          lastName: entry.lastName,
          roles: ["student"],
          parent_uuid: authUser.id,
          instrument: parseInstruments(entry.instrumentRaw),
          teacherIds: [],
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
