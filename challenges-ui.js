import { supabase } from "./supabaseClient.js";
import { createChallenge } from "./challenges-api.js";

function toDateInputValue(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateInput, days) {
  const d = new Date(`${dateInput}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

function parseRoles(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(role => String(role || "").toLowerCase());
  return [String(value || "").toLowerCase()];
}

function getUserLabel(user) {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  const full = `${first} ${last}`.trim();
  return full || String(user?.email || "User");
}

function isStaff(roles) {
  const normalized = Array.isArray(roles) ? roles.map(role => String(role || "").toLowerCase()) : [];
  return normalized.includes("admin") || normalized.includes("teacher");
}

function ensureModals() {
  if (!document.getElementById("createChallengeOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "createChallengeOverlay";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal staff-challenge-modal">
        <div class="modal-header">
          <div class="modal-title">Create a Challenge</div>
          <button id="createChallengeCloseBtn" class="modal-close" type="button">x</button>
        </div>
        <div class="modal-body">
          <div class="modal-field">
            <label for="challengeTitleInput">Title</label>
            <input id="challengeTitleInput" type="text" maxlength="120" />
          </div>
          <div class="modal-field">
            <label for="challengePointsInput">Points</label>
            <input id="challengePointsInput" type="number" min="0" step="1" />
          </div>
          <div class="modal-field">
            <label>Assign to</label>
            <div class="challenge-radio-group">
              <label><input type="radio" name="challengeAssignType" value="whole_studio" checked /> Whole Studio</label>
              <label><input type="radio" name="challengeAssignType" value="teacher_students" /> Specific teacher's students only</label>
              <label><input type="radio" name="challengeAssignType" value="selected_students" /> Select students only</label>
            </div>
          </div>
          <div id="challengeTeacherField" class="modal-field" style="display:none;">
            <label for="challengeTeacherSelect">Teacher</label>
            <select id="challengeTeacherSelect"></select>
            <div id="challengeTeacherLocked" class="challenge-helper" style="display:none;"></div>
          </div>
          <div id="challengeStudentsField" class="modal-field" style="display:none;">
            <label for="challengeStudentSearchInput">Students</label>
            <div class="challenge-student-picker">
              <input id="challengeStudentSearchInput" type="text" placeholder="Type a student name..." autocomplete="off" />
              <div id="challengeStudentDropdown" class="challenge-student-dropdown" hidden></div>
              <div id="challengeStudentChips" class="challenge-student-chips"></div>
            </div>
          </div>
          <div class="challenge-date-row">
            <div class="modal-field">
              <label for="challengeStartDateInput">Start date</label>
              <input id="challengeStartDateInput" type="date" />
            </div>
            <div class="modal-field">
              <label for="challengeEndDateInput">End date</label>
              <input id="challengeEndDateInput" type="date" />
            </div>
          </div>
          <div class="modal-field">
            <label for="challengeDescriptionInput">Description / instructions</label>
            <textarea id="challengeDescriptionInput" rows="3"></textarea>
          </div>
          <div id="challengeCreateError" class="staff-msg" style="display:none;"></div>
        </div>
        <div class="modal-actions">
          <button id="challengeCancelBtn" type="button" class="blue-button">Cancel</button>
          <button id="challengeCreateSubmitBtn" type="button" class="blue-button">Create challenge</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  if (!document.getElementById("activeChallengesOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "activeChallengesOverlay";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal staff-challenge-modal">
        <div class="modal-header">
          <div class="modal-title">Active challenges</div>
          <button id="activeChallengesCloseBtn" class="modal-close" type="button">x</button>
        </div>
        <div class="modal-body">
          <div id="activeChallengesList" class="challenge-active-list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
}

export async function initStaffChallengesUI({ studioId, user, roles, showToast }) {
  const createHeaderBtn = document.getElementById("challengeCreateBtn");
  const activeHeaderBtn = document.getElementById("challengeActiveBtn");
  if (!createHeaderBtn || !activeHeaderBtn) return;

  const resolvedStudioId = String(studioId || "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ensureValidStudioId = () => {
    if (uuidPattern.test(resolvedStudioId)) return true;
    console.error("[ChallengesUI] invalid studioId:", resolvedStudioId);
    if (typeof showToast === "function") showToast("Studio not selected; cannot load challenges.");
    return false;
  };

  if (!resolvedStudioId || !user?.id || !isStaff(roles)) {
    createHeaderBtn.hidden = true;
    activeHeaderBtn.hidden = true;
    return;
  }

  ensureModals();
  createHeaderBtn.hidden = false;
  activeHeaderBtn.hidden = true;

  const createOverlay = document.getElementById("createChallengeOverlay");
  const activeOverlay = document.getElementById("activeChallengesOverlay");

  let users = [];
  let students = [];
  let teachers = [];
  const selectedStudentIds = new Set();
  let endTouched = false;

  const titleInput = document.getElementById("challengeTitleInput");
  const pointsInput = document.getElementById("challengePointsInput");
  const teacherField = document.getElementById("challengeTeacherField");
  const teacherSelect = document.getElementById("challengeTeacherSelect");
  const teacherLocked = document.getElementById("challengeTeacherLocked");
  const studentsField = document.getElementById("challengeStudentsField");
  const studentSearchInput = document.getElementById("challengeStudentSearchInput");
  const studentDropdown = document.getElementById("challengeStudentDropdown");
  const studentChips = document.getElementById("challengeStudentChips");
  const startInput = document.getElementById("challengeStartDateInput");
  const endInput = document.getElementById("challengeEndDateInput");
  const descriptionInput = document.getElementById("challengeDescriptionInput");
  const createActionBtn = document.getElementById("challengeCreateSubmitBtn");
  const cancelBtn = document.getElementById("challengeCancelBtn");
  const closeBtn = document.getElementById("createChallengeCloseBtn");
  const errorEl = document.getElementById("challengeCreateError");
  const activeList = document.getElementById("activeChallengesList");
  const activeCloseBtn = document.getElementById("activeChallengesCloseBtn");

  const setError = (message = "") => {
    if (!errorEl) return;
    if (!message) {
      errorEl.style.display = "none";
      errorEl.textContent = "";
      return;
    }
    errorEl.style.display = "block";
    errorEl.style.color = "#c62828";
    errorEl.textContent = message;
  };

  const getAssignType = () => {
    const checked = document.querySelector("input[name='challengeAssignType']:checked");
    return checked?.value || "whole_studio";
  };

  const hideCreateModal = () => {
    if (createOverlay) createOverlay.style.display = "none";
    if (studentDropdown) studentDropdown.hidden = true;
    setError("");
  };

  const hideActiveModal = () => {
    if (activeOverlay) activeOverlay.style.display = "none";
  };

  const setDefaultDates = () => {
    const today = toDateInputValue(new Date());
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = addDays(today, 30);
    endTouched = false;
  };

  const getTeacherDefaultId = () => {
    if (user?.isTeacher && !user?.isAdmin) return String(user.id);
    return String(teacherSelect?.value || "");
  };

  const renderStudentChips = () => {
    if (!studentChips) return;
    const ids = Array.from(selectedStudentIds);
    if (!ids.length) {
      studentChips.innerHTML = `<span class="staff-student-empty">No students selected</span>`;
      return;
    }
    studentChips.innerHTML = ids.map(id => {
      const student = students.find(entry => String(entry.id) === String(id));
      return `<button type="button" class="staff-student-chip challenge-chip" data-student-id="${id}">${getUserLabel(student)} x</button>`;
    }).join("");
  };

  const renderStudentDropdown = () => {
    if (!studentDropdown || !studentSearchInput) return;
    const query = String(studentSearchInput.value || "").trim().toLowerCase();
    const filtered = students
      .filter(student => !selectedStudentIds.has(String(student.id)))
      .filter(student => !query || getUserLabel(student).toLowerCase().includes(query))
      .sort((a, b) => getUserLabel(a).localeCompare(getUserLabel(b), undefined, { sensitivity: "base" }));

    if (!filtered.length) {
      studentDropdown.innerHTML = `<div class="staff-student-no-match">No students found</div>`;
      studentDropdown.hidden = false;
      return;
    }

    studentDropdown.innerHTML = filtered.map(student => `
      <button type="button" class="staff-student-option challenge-student-option" data-student-id="${student.id}">
        ${getUserLabel(student)}
      </button>
    `).join("");
    studentDropdown.hidden = false;
  };

  const updateAssignFields = () => {
    const assignmentType = getAssignType();
    if (teacherField) teacherField.style.display = assignmentType === "teacher_students" ? "" : "none";
    if (studentsField) studentsField.style.display = assignmentType === "selected_students" ? "" : "none";
    if (assignmentType !== "selected_students" && studentDropdown) studentDropdown.hidden = true;
  };

  const isFormValid = () => {
    const title = String(titleInput?.value || "").trim();
    const points = Number(pointsInput?.value);
    const startDate = String(startInput?.value || "");
    const endDate = String(endInput?.value || "");
    const assignmentType = getAssignType();
    if (!title) return false;
    if (!Number.isFinite(points) || points < 0) return false;
    if (!startDate || !endDate || endDate < startDate) return false;
    if (assignmentType === "teacher_students" && !getTeacherDefaultId()) return false;
    if (assignmentType === "selected_students" && selectedStudentIds.size === 0) return false;
    return true;
  };

  const updateCreateEnabled = () => {
    if (createActionBtn) createActionBtn.disabled = !isFormValid();
  };

  const resetCreateForm = () => {
    if (titleInput) titleInput.value = "";
    if (pointsInput) pointsInput.value = "5";
    if (descriptionInput) descriptionInput.value = "";
    document.querySelectorAll("input[name='challengeAssignType']").forEach(input => {
      input.checked = input.value === "whole_studio";
    });
    selectedStudentIds.clear();
    renderStudentChips();
    setDefaultDates();
    updateAssignFields();
    updateCreateEnabled();
    setError("");
  };

  const fetchUsers = async () => {
    if (!ensureValidStudioId()) throw new Error("Invalid studio id");
    const { data, error } = await supabase
      .from("users")
      .select("id, firstName, lastName, email, roles, active, deactivated_at, studio_id")
      .eq("studio_id", resolvedStudioId)
      .eq("active", true)
      .is("deactivated_at", null);
    if (error) throw error;
    users = Array.isArray(data) ? data : [];
    students = users.filter(entry => parseRoles(entry.roles).includes("student"));
    teachers = users.filter(entry => {
      const roleSet = parseRoles(entry.roles);
      return roleSet.includes("teacher") || roleSet.includes("admin");
    });
  };

  const populateTeacherField = () => {
    if (!teacherSelect || !teacherLocked) return;
    if (user?.isTeacher && !user?.isAdmin) {
      const self = teachers.find(entry => String(entry.id) === String(user.id));
      teacherSelect.innerHTML = `<option value="${user.id}">${getUserLabel(self || user)}</option>`;
      teacherSelect.value = String(user.id);
      teacherSelect.disabled = true;
      teacherSelect.style.display = "none";
      teacherLocked.style.display = "";
      teacherLocked.textContent = `Teacher: ${getUserLabel(self || user)}`;
      return;
    }
    teacherSelect.style.display = "";
    teacherLocked.style.display = "none";
    teacherSelect.disabled = false;
    teacherSelect.innerHTML = `<option value="">Select teacher</option>` + teachers
      .sort((a, b) => getUserLabel(a).localeCompare(getUserLabel(b), undefined, { sensitivity: "base" }))
      .map(entry => `<option value="${entry.id}">${getUserLabel(entry)}</option>`)
      .join("");
  };

  const openCreateModal = async () => {
    try {
      await fetchUsers();
      populateTeacherField();
      resetCreateForm();
      if (createOverlay) createOverlay.style.display = "flex";
      titleInput?.focus();
    } catch (error) {
      setError(error?.message || "Unable to load challenge form");
      if (createOverlay) createOverlay.style.display = "flex";
    }
  };

  const loadActiveChallenges = async () => {
    if (!activeList) return 0;
    if (!ensureValidStudioId()) return 0;
    const previousHtml = activeList.innerHTML;
    activeList.innerHTML = "Loading...";

    const today = toDateInputValue(new Date());
    const { data, error } = await supabase
      .from("teacher_challenges")
      .select("id, title, end_date")
      .eq("studio_id", resolvedStudioId)
      .gte("end_date", today)
      .order("end_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ChallengesUI] failed to load active challenges", error);
      if (typeof showToast === "function") showToast("Couldn't load challenges.");
      activeList.innerHTML = previousHtml || `<div class="staff-student-no-match">Unable to load active challenges.</div>`;
      return 0;
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      activeList.innerHTML = `<div class="staff-student-no-match">No active challenges yet.</div>`;
      activeHeaderBtn.hidden = true;
      activeHeaderBtn.textContent = "Active";
      return 0;
    }

    activeList.innerHTML = rows.map(row => `
      <div class="challenge-active-row">
        <div class="challenge-active-title">${String(row.title || "Untitled challenge")}</div>
        <div class="challenge-active-date">Ends ${String(row.end_date || "")}</div>
      </div>
    `).join("");
    activeHeaderBtn.hidden = false;
    activeHeaderBtn.textContent = `Active (${rows.length})`;
    return rows.length;
  };

  const openActiveModal = async () => {
    await loadActiveChallenges();
    if (activeOverlay) activeOverlay.style.display = "flex";
  };

  createHeaderBtn.addEventListener("click", openCreateModal);
  activeHeaderBtn.addEventListener("click", openActiveModal);
  cancelBtn?.addEventListener("click", hideCreateModal);
  closeBtn?.addEventListener("click", hideCreateModal);
  activeCloseBtn?.addEventListener("click", hideActiveModal);

  createOverlay?.addEventListener("click", event => {
    if (event.target === createOverlay) hideCreateModal();
  });
  activeOverlay?.addEventListener("click", event => {
    if (event.target === activeOverlay) hideActiveModal();
  });

  titleInput?.addEventListener("input", updateCreateEnabled);
  pointsInput?.addEventListener("input", updateCreateEnabled);
  teacherSelect?.addEventListener("change", updateCreateEnabled);
  startInput?.addEventListener("change", () => {
    if (!endTouched && startInput?.value && endInput) endInput.value = addDays(startInput.value, 30);
    updateCreateEnabled();
  });
  endInput?.addEventListener("change", () => {
    endTouched = true;
    updateCreateEnabled();
  });

  document.querySelectorAll("input[name='challengeAssignType']").forEach(input => {
    input.addEventListener("change", () => {
      updateAssignFields();
      updateCreateEnabled();
    });
  });

  studentSearchInput?.addEventListener("input", () => {
    renderStudentDropdown();
    updateCreateEnabled();
  });
  studentSearchInput?.addEventListener("focus", renderStudentDropdown);

  studentDropdown?.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest(".challenge-student-option") : null;
    if (!button) return;
    const studentId = String(button.getAttribute("data-student-id") || "");
    if (!studentId) return;
    selectedStudentIds.add(studentId);
    if (studentSearchInput) studentSearchInput.value = "";
    renderStudentChips();
    renderStudentDropdown();
    updateCreateEnabled();
  });

  studentChips?.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest(".challenge-chip") : null;
    if (!button) return;
    const studentId = String(button.getAttribute("data-student-id") || "");
    if (!studentId) return;
    selectedStudentIds.delete(studentId);
    renderStudentChips();
    renderStudentDropdown();
    updateCreateEnabled();
  });

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (!target.closest(".challenge-student-picker") && studentDropdown) studentDropdown.hidden = true;
  });

  createActionBtn?.addEventListener("click", async () => {
    setError("");
    if (!isFormValid()) {
      setError("Please complete all required fields.");
      return;
    }

    const assignmentType = getAssignType();
    const payload = {
      studioId: resolvedStudioId,
      title: String(titleInput?.value || "").trim(),
      description: String(descriptionInput?.value || "").trim() || null,
      points: Number(pointsInput?.value),
      assignmentType,
      assignmentTeacherId: assignmentType === "teacher_students" ? getTeacherDefaultId() : null,
      selectedStudentIds: assignmentType === "selected_students" ? Array.from(selectedStudentIds) : null,
      startDate: String(startInput?.value || ""),
      endDate: String(endInput?.value || "")
    };

    createActionBtn.disabled = true;
    try {
      if (!ensureValidStudioId()) return;
      await createChallenge(payload);
      hideCreateModal();
      if (typeof showToast === "function") showToast("Challenge created");
      await loadActiveChallenges();
    } catch (error) {
      setError(error?.message || "Unable to create challenge");
    } finally {
      createActionBtn.disabled = !isFormValid();
    }
  });

  updateAssignFields();
  renderStudentChips();
  updateCreateEnabled();
  await loadActiveChallenges();
}
