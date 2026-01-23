// settings.js — patched to fix password/email updates with switched profiles
import { supabase } from "./supabaseClient.js";
import { clearAppSessionCache, recalculateUserPoints, ensureUserRow, getAuthUserId, getViewerContext } from './utils.js';
import { clearActiveProfileId, getActiveProfileId, setActiveProfileId } from './active-profile.js';

let authViewerId = null;
let activeStudioId = null;
let teacherOptionData = [];
let authEmail = null;
let authProfileCache = null;
let pendingSensitiveAction = null;
let addStudentOpen = false;

// ---------- helpers ----------
function getHighestRole(roles) {
  const priority = { admin: 3, teacher: 2, student: 1, parent: 0 };
  if (!Array.isArray(roles)) return 'student';
  return roles.slice().sort((a, b) => (priority[b?.toLowerCase()] ?? -1) - (priority[a?.toLowerCase()] ?? -1))[0];
}
function normalizeUUID(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
}
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

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

function setTeacherError(message) {
  const errorEl = document.getElementById("teacherSelectError");
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.style.display = message ? "block" : "none";
}

function openPasswordModal({ onConfirm }) {
  const overlay = document.getElementById("passwordConfirmModal");
  const input = document.getElementById("confirmPasswordInput");
  const errorEl = document.getElementById("confirmPasswordError");
  if (!overlay || !input) return;
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  pendingSensitiveAction = onConfirm;
  overlay.classList.add("is-open");
  setTimeout(() => input.focus(), 0);
}

function closePasswordModal() {
  const overlay = document.getElementById("passwordConfirmModal");
  const input = document.getElementById("confirmPasswordInput");
  const errorEl = document.getElementById("confirmPasswordError");
  if (overlay) overlay.classList.remove("is-open");
  if (input) input.value = "";
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  pendingSensitiveAction = null;
}

function setPasswordModalError(message) {
  const errorEl = document.getElementById("confirmPasswordError");
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
  const errorEl = document.getElementById("addStudentError");
  const teacherError = document.getElementById("addStudentTeacherError");
  if (!overlay || !teacherSelect) return;

  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  if (teacherError) {
    teacherError.textContent = "";
    teacherError.style.display = "none";
  }
  if (firstName) firstName.value = "";
  if (lastName) lastName.value = "";
  if (instrument) instrument.value = "";

  teacherSelect.innerHTML = "";
  if (teacherOptionData.length === 0) {
    teacherSelect.disabled = true;
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No teachers available";
    teacherSelect.appendChild(opt);
  } else {
    teacherSelect.disabled = false;
    teacherOptionData.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      teacherSelect.appendChild(opt);
    });
  }

  overlay.classList.add("is-open");
  addStudentOpen = true;
  setTimeout(() => firstName?.focus(), 0);
}

function closeAddStudentModal() {
  const overlay = document.getElementById("addStudentModal");
  if (overlay) overlay.classList.remove("is-open");
  addStudentOpen = false;
}

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
  if (teacherOptionData.length > 0 && teacherIds.length === 0) {
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
    instrument: instrumentRaw,
    teacherIds,
    points: 0,
    level: 1,
    active: true,
    studio_id: activeStudioId,
    showonleaderboard: true
  };

  const { error: insertErr } = await supabase.from("users").insert([payload]);
  if (insertErr) {
    console.error("[Settings] add student failed", insertErr);
    setAddStudentError(insertErr.message || "Failed to add student.");
    return;
  }

  const { error: linkErr } = await supabase.rpc("link_parent_student", {
    p_student_id: studentId,
    p_studio_id: activeStudioId
  });
  if (linkErr) {
    console.error("[Settings] link_parent_student failed", linkErr);
  }

  closeAddStudentModal();
  await renderLinkedStudents(authViewerId, activeStudioId);
}

async function confirmPasswordAndRun() {
  const input = document.getElementById("confirmPasswordInput");
  const password = (input?.value || "").trim();
  if (!password) {
    setPasswordModalError("Please enter your password.");
    return;
  }
  const { data: authData } = await supabase.auth.getUser();
  const email = authEmail || authData?.user?.email;
  if (!email) {
    setPasswordModalError("Missing account email. Please log in again.");
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setPasswordModalError("Incorrect password.");
    return;
  }
  const action = pendingSensitiveAction;
  closePasswordModal();
  if (typeof action === "function") {
    await action();
  }
}

async function loadLinkedStudents(parentId, studioId, options = {}) {
  if (!parentId) return [];
  const includeInactive = options.includeInactive !== false;
  let query = supabase
    .from("parent_student_links")
    .select("student_id")
    .eq("parent_id", parentId);
  if (studioId) query = query.eq("studio_id", studioId);

  const { data: links, error } = await query;
  if (error) {
    console.error("[Settings] parent_student_links fetch failed", error);
    return [];
  }
  const ids = (links || []).map(l => l.student_id).filter(Boolean);
  if (!ids.length) return [];

  const { data: students, error: studentErr } = await supabase
    .from("users")
    .select("id, firstName, lastName, avatarUrl, deactivated_at")
    .in("id", ids)
    .order("lastName", { ascending: true })
    .order("firstName", { ascending: true });
  if (studentErr) {
    console.error("[Settings] linked students fetch failed", studentErr);
    return [];
  }
  const list = Array.isArray(students) ? students : [];
  return includeInactive ? list : list.filter(s => !s.deactivated_at);
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

      openPasswordModal({
        onConfirm: async () => {
          const target = students.find(s => String(s.id) === String(studentId));
          const isActive = target && !target.deactivated_at;
          const nextValue = isActive ? new Date().toISOString() : null;
          const { error } = await supabase
            .from("users")
            .update({ deactivated_at: nextValue })
            .eq("id", studentId);
          if (error) {
            console.error("[Settings] failed to update student status", error);
            alert("Failed to update student status.");
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
        }
      });
    });
  });

  list.querySelectorAll("button[data-action=\"change-avatar\"]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const studentId = btn.dataset.id;
      const input = list.querySelector(`input.student-avatar-input[data-id="${studentId}"]`);
      if (!input) return;
      openPasswordModal({
        onConfirm: async () => {
          input.click();
        }
      });
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
      } catch (err) {
        console.error("[Settings] avatar upload failed", err);
        alert("Avatar upload failed.");
      } finally {
        input.value = "";
      }
    });
  });

  list.querySelectorAll(".family-student-row").forEach(row => {
    row.addEventListener("click", async (e) => {
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

function applyTeacherOptionsToSelect(selectEl) {
  if (!selectEl) return;
  if (teacherOptionData.length === 0) {
    selectEl.innerHTML = "";
    selectEl.disabled = true;
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No teachers available";
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

async function loadTeachersForStudio(studioId) {
  if (!studioId) {
    teacherOptionData = [];
    return;
  }
  const { data: users, error } = await supabase
    .from("users")
    .select("id, firstName, lastName, roles")
    .eq("studio_id", studioId);

  if (error) {
    console.error("[Settings] teacher load failed", error);
    teacherOptionData = [];
    return;
  }

  const teachers = (users || [])
    .filter(u => {
      const roles = parseRoles(u.roles);
      return roles.includes("teacher") || roles.includes("admin");
    })
    .sort(
      (a, b) =>
        (a.lastName || "").localeCompare(b.lastName || "") ||
        (a.firstName || "").localeCompare(b.firstName || "")
    );

  teacherOptionData = teachers.map(t => ({
    id: t.id,
    label: (`${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() || "Unnamed Teacher")
  }));
}
function clearActiveStudentCacheIfStudent(roles) {
  if (!Array.isArray(roles)) return;
  const normalized = roles.map(r => String(r).toLowerCase());
  if (!normalized.includes('student')) return;
  const studioId = activeStudioId || localStorage.getItem('activeStudioId');
  if (studioId && authViewerId) {
    localStorage.removeItem(`aa.activeStudent.${studioId}.${authViewerId}`);
  }
  localStorage.removeItem('activeStudentId');
}

// ---------- related users (parent/children/siblings) ----------
async function fetchRelatedUsers(user) {
  // Option A: loggedInUser may be a student profile.
  // Always anchor “family” to the AUTH login id when available.
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;

  const currentId = normalizeUUID(user?.id);
  const anchorParentId = normalizeUUID(authUser?.id) || normalizeUUID(user?.parent_uuid) || currentId;

  const { data: family, error } = await supabase
    .from('users')
    .select('*')
    .eq('parent_uuid', anchorParentId);

  if (error) {
    console.error('[Settings] fetchRelatedUsers failed:', error);
    return [];
  }

  // Return everyone linked to this parent_uuid, excluding the currently selected profile
  return (family || []).filter(u => normalizeUUID(u.id) !== currentId);
}

// ---------- UI: switchers ----------
async function promptUserSwitch() {
  const current = JSON.parse(localStorage.getItem('loggedInUser')) || {};
  let allUsers = JSON.parse(localStorage.getItem('allUsers')) || [];

  // Must have at least one *other* profile to switch to
  const others = allUsers.filter(u => String(u.id) !== String(current.id));
  if (others.length === 0) {
    alert('No other profiles are linked to this login yet.');
    return;
  }

  const listContainer = document.getElementById('userSwitchList');
  listContainer.innerHTML = '';

  if (authViewerId) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'blue-button';
    btn.style = 'margin: 5px 0; width: 100%;';
    btn.textContent = 'Parent (Me)';
    btn.onclick = () => {
      setActiveProfileId(authViewerId);
      window.location.href = 'index.html';
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  }

  others.forEach(u => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'blue-button';
    btn.style = 'margin: 5px 0; width: 100%;';
    const rolesText = Array.isArray(u.roles) ? u.roles.join(', ') : (u.role || '');
    btn.textContent = `${u.firstName ?? ''} ${u.lastName ?? ''} (${rolesText})`.trim();
    btn.onclick = async () => {
      // Option A: loggedInUser is the selected STUDENT profile
      localStorage.setItem('loggedInUser', JSON.stringify(u));
      setActiveProfileId(u.id);

      // keep your existing "highest role" logic
      const priority = { admin:3, teacher:2, student:1, parent:0 };
      const roles = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
      const highest = roles.slice().sort((a,b)=>(priority[b?.toLowerCase()]??-1)-(priority[a?.toLowerCase()]??-1))[0] || 'student';
      localStorage.setItem('activeRole', highest);
      clearActiveStudentCacheIfStudent(roles);

      try {
        const m = await import('./utils.js').catch(()=>null);
        if (m?.recalculateUserPoints) await m.recalculateUserPoints(u.id);
      } catch {}

      window.location.href = 'index.html';
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });

  document.getElementById('userSwitchModal').style.display = 'flex';
}

function promptRoleSwitch() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  const roles = (Array.isArray(user.roles) ? user.roles : [user.role]).filter(r => r && r.toLowerCase() !== 'parent');
  const listContainer = document.getElementById('roleSwitchList');
  listContainer.innerHTML = '';
  roles.forEach(role => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'blue-button';
    btn.style = 'margin: 5px 0; width: 100%;';
    btn.textContent = capitalize(role);
    btn.onclick = () => {
      localStorage.setItem('activeRole', role);
      clearActiveStudentCacheIfStudent([role]);
      window.location.href = 'index.html';
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });
  document.getElementById('roleSwitchModal').style.display = 'flex';
}

// ---------- credentials guard ----------
function applyCredsGuard(isOwn) {
  const newEmail = document.getElementById('newEmail');
  const curPw   = document.getElementById('currentPassword');
  const newPw   = document.getElementById('newPassword');

  if (!isOwn) {
    [newEmail, curPw, newPw].forEach(el => { if (el) el.disabled = true; });
    // Add a one-line helper if not present
    if (!document.getElementById('credsGuard')) {
      const msg = document.createElement('small');
      msg.id = 'credsGuard';
      msg.style.color = '#00477d';
      msg.style.display = 'block';
      msg.style.marginTop = '-10px';
      msg.style.marginBottom = '10px';
      msg.textContent = 'You’re viewing another profile. You can only change the login email & password for the account you’re signed into.';
      newPw?.insertAdjacentElement('afterend', msg);
    }
  } else {
    // Ensure enabled for own account
    [newEmail, curPw, newPw].forEach(el => { if (el) el.disabled = false; });
    const msg = document.getElementById('credsGuard');
    if (msg) msg.remove();
  }
}

// ---------- save ----------
async function saveSettings() {
  const authUserId = await getAuthUserId();
  if (!authUserId) {
    alert('You must be logged in.');
    return;
  }

  const { data: authProfile, error: authProfileErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUserId)
    .single();

  if (authProfileErr || !authProfile) {
    console.error('[Settings] failed to load auth profile', authProfileErr);
    alert('Failed to load account profile.');
    return;
  }

  const profile = authProfile;
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  const isEditingOwnAccount = !!(authUser && authUser.id === profile.id);

  const currentEmail  = profile.email || '';
  const newEmail      = (document.getElementById('newEmail').value || '').trim();
  const newPassword   = (document.getElementById('newPassword').value || '').trim();

  const roleList = parseRoles(profile.roles || profile.role);
  const teacherWrap = document.getElementById("teacherSelectWrap");
  const teacherSelect = document.getElementById("teacherIds");

  // Profile fields always editable
  const updatedUser = {
    firstName: (document.getElementById('firstName').value || '').trim(),
    lastName:  (document.getElementById('lastName').value || '').trim(),
    // Only write email to your users table for your own account; otherwise keep current
    email: isEditingOwnAccount ? (newEmail || currentEmail) : currentEmail
  };

  if (teacherWrap && teacherSelect && roleList.includes("student")) {
    const teacherIds = Array.from(teacherSelect.selectedOptions || []).map(o => o.value);
    if (teacherOptionData.length > 0 && teacherIds.length === 0) {
      setTeacherError("Please select your teacher.");
      return;
    }
    updatedUser.teacherIds = teacherIds;
  }

  try {
    // 1) Update profile in your users table
    const { error: dbError } = await supabase.from('users').update(updatedUser).eq('id', profile.id);
    if (dbError) throw dbError;

    // 2) Handle auth changes only for own account
    if (isEditingOwnAccount) {
      const emailChanged    = !!(newEmail && newEmail !== currentEmail);
      const passwordChanged = !!newPassword;

      if (emailChanged) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: newEmail });
        if (emailErr) {
          alert('Failed to update email: ' + emailErr.message);
          return;
        }
        alert('Check your new email to confirm the change.');
      }

      if (passwordChanged) {
        const { error: passErr } = await supabase.auth.updateUser({ password: newPassword });
        if (passErr) {
          alert('Failed to update password: ' + passErr.message);
          return;
        }
        alert('Password updated successfully.');
      }
    }

    // Refresh local cache and return
    Object.assign(profile, updatedUser);
    localStorage.setItem('loggedInUser', JSON.stringify(profile));
    alert('Settings saved successfully!');
    window.location.href = 'index.html';
  } catch (err) {
    console.error('[ERROR] Save settings failed:', err);
    alert('Failed to update settings: ' + (err?.message || err));
  }
}

// ---------- init ----------
document.addEventListener('DOMContentLoaded', async () => {
  const authUserId = await getAuthUserId();
  console.log('[Identity] authUserId', authUserId);
  if (!authUserId) {
    alert('You must be logged in.');
    window.location.replace("./login.html");
    return;
  }
  authViewerId = authUserId;
  const viewerContext = await getViewerContext();
  activeStudioId = viewerContext?.studioId || localStorage.getItem('activeStudioId');
  await loadTeachersForStudio(activeStudioId);

  const { data: authProfile, error: authProfileErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUserId)
    .single();

  if (authProfileErr || !authProfile) {
    console.error('[Settings] failed to load auth profile', authProfileErr);
    alert('Failed to load account profile.');
    window.location.replace("./login.html");
    return;
  }

  console.log('[Identity] loaded profile id', authProfile.id);
  authProfileCache = authProfile;
  const { data: authData } = await supabase.auth.getUser();
  authEmail = authData?.user?.email || authProfile?.email || null;
  let user = authProfile;
  let activeRole = localStorage.getItem('activeRole');
  if (!activeRole && user?.roles) {
    activeRole = getHighestRole(user.roles);
    localStorage.setItem('activeRole', activeRole);
  }

  const ensured = await ensureUserRow();
  if (ensured && String(ensured.id) === String(user.id)) {
    user = { ...user, ...ensured };
  }

  if (!user || !activeRole) {
    alert('You must be logged in.');
window.location.replace("./login.html");
return;
  }

  // hydrate fields
  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value  = user.lastName  || '';
  document.getElementById('newEmail').value  = authEmail || user.email || '';
  const avatarImageEl = document.getElementById('avatarImage');
  if (avatarImageEl) {
    avatarImageEl.src = user.avatarUrl || 'images/logos/default.png';
  }
  const teacherWrap = document.getElementById("teacherSelectWrap");
  const teacherSelect = document.getElementById("teacherIds");
  const roleList = parseRoles(user.roles || user.role);
  if (teacherWrap && teacherSelect && roleList.includes("student")) {
    teacherWrap.style.display = "";
    await loadTeachersForStudio(activeStudioId);
    applyTeacherOptionsToSelect(teacherSelect);
    const selectedIds = Array.isArray(user.teacherIds) ? user.teacherIds.map(String) : [user.teacherIds].filter(Boolean).map(String);
    selectedIds.forEach(id => {
      const opt = Array.from(teacherSelect.options).find(o => o.value === id);
      if (opt) opt.selected = true;
    });
    teacherSelect.addEventListener("change", () => setTeacherError(""));
  } else if (teacherWrap) {
    teacherWrap.style.display = "none";
  }
  // ----- Avatar click → file picker + upload -----
  const avatarImgEl = document.getElementById('avatarImage');
  const avatarInputEl = document.getElementById('avatarInput');

  if (avatarImgEl && avatarInputEl) {
    avatarImgEl.addEventListener('click', () => avatarInputEl.click());

    avatarInputEl.addEventListener('change', async () => {
      try {
        const file = avatarInputEl.files?.[0];
        if (!file) return;

        const { data: authData } = await supabase.auth.getUser();
        const authUser = authData?.user || null;
        if (!authUser?.id) throw new Error('Auth user not available for avatar upload');

        const bucketName = 'avatars';
        const filePath = `${authUser.id}/avatar.png`;

        // Upload (upsert overwrites existing)
        const { error: upErr } = await supabase
          .storage
          .from(bucketName)
          .upload(filePath, file, { upsert: true, contentType: file.type });

        if (upErr) {
          console.error('[Avatar] upload error', { bucketName, filePath, error: upErr });
          throw upErr;
        }

        // Public URL (bucket is public)
        const { data: pub } = supabase
          .storage
          .from(bucketName)
          .getPublicUrl(filePath);

        const publicUrl = pub?.publicUrl;
        if (!publicUrl) throw new Error('Failed to generate public avatar URL');

        // Save to users table + localStorage
        const { error: dbErr } = await supabase
          .from('users')
          .update({ avatarUrl: publicUrl })
          .eq('id', authUser.id);

        if (dbErr) {
          console.error('[Avatar] update error', { bucketName, filePath, error: dbErr });
          throw dbErr;
        }

        user.avatarUrl = publicUrl;
        localStorage.setItem('loggedInUser', JSON.stringify(user));
        avatarImgEl.src = publicUrl;

        alert('Avatar updated!');
      } catch (err) {
        console.error('[Avatar] upload failed:', err);
        alert('Avatar upload failed: ' + (err?.message || err));
      } finally {
        // allow re-selecting same file
        avatarInputEl.value = '';
      }
    });
  }

  // determine if viewing own account for creds guard
  const authUser = authData?.user || null;
  applyCredsGuard(!!(authUser && authUser.id === user.id));

// build linked users list for switcher (Option A)
let updatedAllUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
if (!updatedAllUsers.some(u => String(u.id) === String(user.id))) updatedAllUsers.push(user);

const linkedForSwitch = await loadLinkedStudents(authUserId, activeStudioId, { includeInactive: false });
linkedForSwitch.forEach(k => {
  if (!updatedAllUsers.some(u => String(u.id) === String(k.id))) updatedAllUsers.push(k);
});

// de-dupe
updatedAllUsers = updatedAllUsers.filter((v, i, a) => a.findIndex(t => String(t.id) === String(v.id)) === i);
localStorage.setItem('allUsers', JSON.stringify(updatedAllUsers));

  await renderLinkedStudents(authUserId, activeStudioId);

  // show/hide switch buttons
  const switchUserBtn = document.getElementById('switchUserBtn');
  if (switchUserBtn) switchUserBtn.style.display = 'none';
  document.getElementById('switchRoleBtn').style.display = (user.roles?.length > 1) ? 'inline-block' : 'none';

  // wire buttons
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    await clearAppSessionCache("logout");
    window.location.href = 'login.html';
  });
  document.getElementById('cancelBtn').addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('switchRoleBtn').addEventListener('click', promptRoleSwitch);
  if (switchUserBtn) switchUserBtn.addEventListener('click', promptUserSwitch);
  document.getElementById('saveBtn').addEventListener('click', e => {
    e.preventDefault();
    openPasswordModal({ onConfirm: saveSettings });
  });

  // modal cancels
  document.getElementById('cancelUserSwitchBtn').addEventListener('click', () => {
    document.getElementById('userSwitchModal').style.display = 'none';
  });
  document.getElementById('cancelRoleSwitchBtn').addEventListener('click', () => {
    document.getElementById('roleSwitchModal').style.display = 'none';
  });

  const passwordOverlay = document.getElementById("passwordConfirmModal");
  const passwordCancel = document.getElementById("confirmPasswordCancel");
  const passwordSubmit = document.getElementById("confirmPasswordSubmit");
  const passwordToggle = document.getElementById("confirmPasswordToggle");
  const passwordInput = document.getElementById("confirmPasswordInput");

  if (passwordCancel) passwordCancel.addEventListener("click", closePasswordModal);
  if (passwordSubmit) passwordSubmit.addEventListener("click", confirmPasswordAndRun);
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", () => {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      passwordToggle.textContent = showing ? "Show" : "Hide";
    });
  }
  if (passwordOverlay) {
    passwordOverlay.addEventListener("click", (e) => {
      if (e.target === passwordOverlay) closePasswordModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePasswordModal();
    if (e.key === "Enter" && passwordOverlay?.classList.contains("is-open")) {
      confirmPasswordAndRun();
    }
  });

  const addStudentBtn = document.getElementById("addStudentBtn");
  const addStudentCancel = document.getElementById("addStudentCancel");
  const addStudentSubmit = document.getElementById("addStudentSubmit");
  const addStudentOverlay = document.getElementById("addStudentModal");

  if (addStudentBtn) {
    addStudentBtn.addEventListener("click", () => openAddStudentModal());
  }
  if (addStudentCancel) {
    addStudentCancel.addEventListener("click", closeAddStudentModal);
  }
  if (addStudentSubmit) {
    addStudentSubmit.addEventListener("click", () => {
      openPasswordModal({ onConfirm: handleAddStudent });
    });
  }
  if (addStudentOverlay) {
    addStudentOverlay.addEventListener("click", (e) => {
      if (e.target === addStudentOverlay) closeAddStudentModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!addStudentOpen) return;
    if (e.key === "Escape") closeAddStudentModal();
  });

  if (sessionStorage.getItem('forceUserSwitch') === 'true') {
    sessionStorage.removeItem('forceUserSwitch');
    setTimeout(() => promptUserSwitch(), 400);
  }
});
/* === Append-only: clear password toggles for Settings === */
(function () {
  function addPwToggle(input) {
    if (!input || input.dataset.hasToggle === '1') return;
    input.dataset.hasToggle = '1';

    const wrap = document.createElement('div');
    wrap.className = 'pw-field';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = 'Show';
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!showing));
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      btn.textContent = showing ? 'Show' : 'Hide';
    });
    wrap.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addPwToggle(document.getElementById('newPassword'));
  });
})();
