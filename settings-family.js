import { supabase } from "./supabaseClient.js";
import { getAuthUserId, getViewerContext } from "./utils.js";
import { clearActiveProfileId, getActiveProfileId, setActiveProfileId } from "./active-profile.js";
import { applyTeacherOptionsToSelect, loadTeachersForStudio, normalizeTextArray, showToast } from "./settings-shared.js";
import { getAccountProfiles, renderAccountProfileList, hasRole } from "./account-profiles.js";

let authViewerId = null;
let activeStudioId = null;
let teacherOptions = [];
let addStudentOpen = false;
let viewerContextData = null;
let familyProfiles = [];

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
  await renderFamilyProfiles();
}

async function renderFamilyProfiles() {
  const list = document.getElementById("linkedStudentsList");
  const addMessage = document.getElementById("familyAddMessage");
  if (!list) return;
  if (addMessage) addMessage.textContent = "";
  list.innerHTML = "<p class=\"empty-state\">Loading users...</p>";

  const profiles = await getAccountProfiles(viewerContextData, { includeInactive: true });
  familyProfiles = profiles;
  if (!profiles.length) {
    list.innerHTML = "";
    if (addMessage) addMessage.textContent = "No users linked to this account yet.";
    return;
  }

  list.innerHTML = "";
  renderAccountProfileList(list, profiles, {
    activeProfileId: getActiveProfileId(),
    renderItem: createFamilyRow,
    emptyState: ""
  });

  const studentProfiles = profiles.filter(profile => hasRole(profile, "student"));
  if (addMessage) {
    addMessage.textContent = studentProfiles.length ? "" : "No students linked to this account yet.";
  }

  attachFamilyRowHandlers();
}

function createFamilyRow(profile, ctx) {
  const isStudent = hasRole(profile, "student");
  const isInactive = Boolean(profile.deactivated_at);
  const row = document.createElement("div");
  const classNames = ["family-student-row"];
  if (isInactive) classNames.push("is-inactive");
  if (ctx.isActive) classNames.push("is-current");
  row.className = classNames.join(" ");
  row.dataset.profileId = profile.id;

  const avatar = document.createElement("div");
  avatar.className = "family-student-avatar";
  avatar.setAttribute("role", "button");
  avatar.setAttribute("tabindex", "0");
  avatar.dataset.id = profile.id;
  const image = document.createElement("img");
  image.src = profile.avatarUrl || "images/icons/default.png";
  image.alt = profile.label;
  avatar.appendChild(image);
  const hint = document.createElement("span");
  hint.className = "family-avatar-hint";
  hint.textContent = "Click to replace avatar";
  avatar.appendChild(hint);

  const info = document.createElement("div");
  info.className = "family-student-info";
  info.innerHTML = `
    <div class="family-student-name">${profile.label}</div>
    <div class="family-student-actions"></div>
  `;

  row.appendChild(avatar);
  row.appendChild(info);

  if (isStudent) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `status-toggle${isInactive ? " is-inactive" : ""}`;
    toggle.dataset.action = "toggle-active";
    toggle.dataset.id = profile.id;
    toggle.setAttribute("aria-pressed", (!isInactive).toString());
    toggle.innerHTML = "<span>Active</span><span>Inactive</span>";
    row.appendChild(toggle);

    const input = document.createElement("input");
    input.className = "student-avatar-input";
    input.dataset.id = profile.id;
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    row.appendChild(input);
  }

  return row;
}

function attachFamilyRowHandlers() {
  const list = document.getElementById("linkedStudentsList");
  if (!list) return;

  list.querySelectorAll("button[data-action=\"toggle-active\"]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const profileId = btn.dataset.id;
      if (!profileId) return;
      const target = familyProfiles.find(profile => String(profile.id) === String(profileId));
      if (!target) return;

      const wasActive = !target.deactivated_at;
      const nextValue = wasActive ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("users")
        .update({ deactivated_at: nextValue })
        .eq("id", profileId);
      if (error) {
        console.error("[Family] failed to update student status", error);
        showToast("Failed to update student status.");
        return;
      }
      const studentId = profileId;
      if (wasActive && String(studentId) === String(getActiveProfileId())) {
        const nextActive = familyProfiles.find(p => hasRole(p, "student") && !p.deactivated_at && String(p.id) !== String(studentId));
        if (nextActive) {
          setActiveProfileId(nextActive.id);
        } else {
          clearActiveProfileId();
        }
        window.location.reload();
        return;
      }
      await renderFamilyProfiles();
    });
  });

  list.querySelectorAll(".family-student-avatar").forEach(avatar => {
    const input = list.querySelector(`input.student-avatar-input[data-id="${avatar.dataset.id}"]`);
    const triggerUpload = (e) => {
      e.stopPropagation();
      if (!input) return;
      input.click();
    };
    avatar.addEventListener("click", triggerUpload);
    avatar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerUpload(e);
      }
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
      const profileId = row.dataset.profileId;
      if (!profileId) return;
      const profile = familyProfiles.find(p => String(p.id) === String(profileId));
      if (!profile || profile.deactivated_at) return;
      setActiveProfileId(profileId);
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

  viewerContextData = await getViewerContext();
  activeStudioId = viewerContextData?.studioId || localStorage.getItem("activeStudioId");
  teacherOptions = await loadTeachersForStudio(activeStudioId);

  await renderFamilyProfiles();

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
