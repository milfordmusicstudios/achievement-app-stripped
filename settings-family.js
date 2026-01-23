import { supabase } from "./supabaseClient.js";
import { getAuthUserId, getViewerContext } from "./utils.js";
import { clearActiveProfileId, getActiveProfileId, setActiveProfileId } from "./active-profile.js";
import { applyTeacherOptionsToSelect, loadLinkedStudents, loadTeachersForStudio, normalizeTextArray, showToast } from "./settings-shared.js";

let authViewerId = null;
let activeStudioId = null;
let teacherOptions = [];
let addStudentOpen = false;

function setAddStudentError(message) {
  const errorEl = document.getElementById("addStudentError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function setAddStudentTeacherError(message) {
  const errorEl = document.getElementById("addStudentTeacherError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function openAddStudentModal() {
  const overlay = document.getElementById("addStudentModal");
  const firstName = document.getElementById("addStudentFirstName");
  const lastName = document.getElementById("addStudentLastName");
  const instrument = document.getElementById("addStudentInstrument");
  const teacherSelect = document.getElementById("addStudentTeachers");
  if (!overlay || !teacherSelect) return;

  setAddStudentError("");
  setAddStudentTeacherError("");
  if (firstName) firstName.value = "";
  if (lastName) lastName.value = "";
  if (instrument) instrument.value = "";

  applyTeacherOptionsToSelect(teacherSelect, teacherOptions);

  overlay.classList.add("is-open");
  addStudentOpen = true;
  setTimeout(() => firstName?.focus(), 0);
}

function closeAddStudentModal() {
  const overlay = document.getElementById("addStudentModal");
  if (overlay) overlay.classList.remove("is-open");
  addStudentOpen = false;
}

async function handleAddStudent() {
  const firstName = (document.getElementById("addStudentFirstName")?.value || "").trim();
  const lastName = (document.getElementById("addStudentLastName")?.value || "").trim();
  const instrumentRaw = (document.getElementById("addStudentInstrument")?.value || "").trim();
  const teacherSelect = document.getElementById("addStudentTeachers");

  if (!firstName || !lastName) {
    setAddStudentError("Please enter first and last name.");
    return;
  }

  const teacherIds = Array.from(teacherSelect?.selectedOptions || []).map(o => o.value);
  if (teacherOptions.length > 0 && teacherIds.length === 0) {
    setAddStudentTeacherError("Please select at least one teacher.");
    return;
  }

  if (!crypto?.randomUUID) {
    setAddStudentError("Browser does not support student creation.");
    return;
  }

  const studentId = crypto.randomUUID();
  const payload = {
    id: studentId,
    firstName,
    lastName,
    roles: ["student"],
    parent_uuid: authViewerId,
    instrument: normalizeTextArray(instrumentRaw),
    teacherIds,
    points: 0,
    level: 1,
    active: true,
    studio_id: activeStudioId,
    showonleaderboard: true
  };

  const { error: insertErr } = await supabase.from("users").insert([payload]);
  if (insertErr) {
    console.error("[Family] add student failed", insertErr);
    setAddStudentError(insertErr.message || "Failed to add student.");
    return;
  }

  const { error: linkErr } = await supabase.rpc("link_parent_student", {
    p_student_id: studentId,
    p_studio_id: activeStudioId
  });
  if (linkErr) {
    console.error("[Family] link_parent_student failed", linkErr);
  }

  showToast("Student added.");
  closeAddStudentModal();
  await renderLinkedStudents(authViewerId, activeStudioId);
}

async function renderLinkedStudents(parentId, studioId) {
  const list = document.getElementById("linkedStudentsList");
  if (!list) return;
  list.innerHTML = "<p class=\"empty-state\">Loading students...</p>";

  const students = await loadLinkedStudents(parentId, studioId);
  const activeProfileId = getActiveProfileId();
  const activeRow = students.find(s => String(s.id) === String(activeProfileId));

  if (activeRow?.deactivated_at) {
    const nextActive = students.find(s => !s.deactivated_at);
    if (nextActive) {
      setActiveProfileId(nextActive.id);
      window.location.reload();
      return;
    }
    clearActiveProfileId();
  }

  if (!students.length) {
    list.innerHTML = "<p class=\"empty-state\">No students linked to this account yet.</p>";
    return;
  }

  list.innerHTML = "";
  students.forEach(student => {
    const isActive = !student.deactivated_at;
    const isCurrent = String(student.id) === String(activeProfileId);
    const name = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "Student";
    const avatarUrl = student.avatarUrl || "images/icons/default.png";

    const row = document.createElement("div");
    row.className = `family-student-row${isActive ? "" : " is-inactive"}${isCurrent ? " is-current" : ""}`;
    row.dataset.studentId = student.id;
    row.innerHTML = `
      <div class="family-student-avatar">
        <img src="${avatarUrl}" alt="${name}">
      </div>
      <div class="family-student-info">
        <div class="family-student-name">${name}</div>
        <div class="family-student-actions">
          <button class="blue-button btn-rect" data-action="change-avatar" data-id="${student.id}">Change avatar</button>
          <input class="student-avatar-input" data-id="${student.id}" type="file" accept="image/*" style="display:none;">
        </div>
      </div>
      <button class="status-toggle${isActive ? "" : " is-inactive"}" data-action="toggle-active" data-id="${student.id}" aria-pressed="${isActive}">
        <span>Active</span>
        <span>Inactive</span>
      </button>
    `;

    list.appendChild(row);
  });

  list.querySelectorAll("button[data-action=\"toggle-active\"]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const studentId = btn.dataset.id;
      if (!studentId) return;

      const target = students.find(s => String(s.id) === String(studentId));
      const isActive = target && !target.deactivated_at;
      const nextValue = isActive ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("users")
        .update({ deactivated_at: nextValue })
        .eq("id", studentId);
      if (error) {
        console.error("[Family] failed to update student status", error);
        showToast("Failed to update student status.");
        return;
      }

      if (isActive && String(studentId) === String(getActiveProfileId())) {
        const refresh = await loadLinkedStudents(parentId, studioId);
        const nextActive = refresh.find(s => !s.deactivated_at);
        if (nextActive) {
          setActiveProfileId(nextActive.id);
        } else {
          clearActiveProfileId();
        }
        window.location.reload();
        return;
      }

      await renderLinkedStudents(parentId, studioId);
    });
  });

  list.querySelectorAll("button[data-action=\"change-avatar\"]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const studentId = btn.dataset.id;
      const input = list.querySelector(`input.student-avatar-input[data-id="${studentId}"]`);
      if (!input) return;
      input.click();
    });
  });

  list.querySelectorAll("input.student-avatar-input").forEach(input => {
    input.addEventListener("change", async () => {
      const studentId = input.dataset.id;
      const file = input.files?.[0];
      if (!file || !studentId) return;

      try {
        const bucketName = "avatars";
        const filePath = `${studentId}/avatar.png`;
        const { error: upErr } = await supabase
          .storage
          .from(bucketName)
          .upload(filePath, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;

        const { data: pub } = supabase
          .storage
          .from(bucketName)
          .getPublicUrl(filePath);
        const publicUrl = pub?.publicUrl;
        if (!publicUrl) throw new Error("Failed to generate public avatar URL");

        const { error: dbErr } = await supabase
          .from("users")
          .update({ avatarUrl: publicUrl })
          .eq("id", studentId);
        if (dbErr) throw dbErr;

        const img = input.closest(".family-student-row")?.querySelector("img");
        if (img) img.src = publicUrl;
        showToast("Avatar updated.");
      } catch (err) {
        console.error("[Family] avatar upload failed", err);
        showToast("Avatar upload failed.");
      } finally {
        input.value = "";
      }
    });
  });

  list.querySelectorAll(".family-student-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      const studentId = row.dataset.studentId;
      if (!studentId) return;
      const student = students.find(s => String(s.id) === String(studentId));
      if (student?.deactivated_at) return;
      setActiveProfileId(studentId);
      window.location.reload();
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  authViewerId = await getAuthUserId();
  if (!authViewerId) {
    window.location.replace("./login.html");
    return;
  }

  const viewerContext = await getViewerContext();
  activeStudioId = viewerContext?.studioId || localStorage.getItem("activeStudioId");
  teacherOptions = await loadTeachersForStudio(activeStudioId);

  await renderLinkedStudents(authViewerId, activeStudioId);

  const addStudentBtn = document.getElementById("addStudentBtn");
  const addStudentCancel = document.getElementById("addStudentCancel");
  const addStudentSubmit = document.getElementById("addStudentSubmit");
  const addStudentOverlay = document.getElementById("addStudentModal");

  if (addStudentBtn) addStudentBtn.addEventListener("click", openAddStudentModal);
  if (addStudentCancel) addStudentCancel.addEventListener("click", closeAddStudentModal);
  if (addStudentSubmit) addStudentSubmit.addEventListener("click", handleAddStudent);
  if (addStudentOverlay) {
    addStudentOverlay.addEventListener("click", (e) => {
      if (e.target === addStudentOverlay) closeAddStudentModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!addStudentOpen) return;
    if (e.key === "Escape") closeAddStudentModal();
  });
});
