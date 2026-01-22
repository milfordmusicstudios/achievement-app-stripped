// settings.js — patched to fix password/email updates with switched profiles
import { supabase } from "./supabaseClient.js";
import { recalculateUserPoints, ensureUserRow, getAuthUserId } from './utils.js';
import { setActiveProfileId } from './active-profile.js';

let authViewerId = null;
let activeStudioId = null;
let teacherOptionData = [];

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
  const currentPassword = (document.getElementById('currentPassword').value || '').trim();

  // Profile fields always editable
  const updatedUser = {
    firstName: (document.getElementById('firstName').value || '').trim(),
    lastName:  (document.getElementById('lastName').value || '').trim(),
    // Only write email to your users table for your own account; otherwise keep current
    email: isEditingOwnAccount ? (newEmail || currentEmail) : currentEmail
  };

  const roleList = parseRoles(profile.roles || profile.role);
  const teacherWrap = document.getElementById("teacherSelectWrap");
  const teacherSelect = document.getElementById("teacherIds");
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

      if ((emailChanged || passwordChanged) && !currentPassword) {
        alert('Please enter your current password to make changes.');
        return;
      }

      if (emailChanged || passwordChanged) {
        // Re-auth with the ACTUAL signed-in user
        const authEmail = authUser.email;
        const { error: reauthErr } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: currentPassword
        });
        if (reauthErr) {
          alert('Current password is incorrect.');
          return;
        }
      }

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
  activeStudioId = localStorage.getItem('activeStudioId');

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
  document.getElementById('newEmail').value  = user.email     || '';
  document.getElementById('avatarImage').src = user.avatarUrl || 'images/logos/default.png';
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
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  applyCredsGuard(!!(authUser && authUser.id === user.id));

// build linked users list for switcher (Option A)
let updatedAllUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
if (!updatedAllUsers.some(u => String(u.id) === String(user.id))) updatedAllUsers.push(user);

// IMPORTANT: use the AUTH login id (parent) to fetch children
const { data: authData2 } = await supabase.auth.getUser();
const authUser2 = authData2?.user || null;

if (authUser2?.id) {
  const { data: kids, error: kidsErr } = await supabase
    .from('users')
    .select('*')
    .eq('parent_uuid', authUser2.id);

  if (kidsErr) {
    console.error('[Settings] Failed to load children:', kidsErr);
  } else {
    (kids || []).forEach(k => {
      if (!updatedAllUsers.some(u => String(u.id) === String(k.id))) updatedAllUsers.push(k);
    });
  }
}

// de-dupe
updatedAllUsers = updatedAllUsers.filter((v, i, a) => a.findIndex(t => String(t.id) === String(v.id)) === i);
localStorage.setItem('allUsers', JSON.stringify(updatedAllUsers));

  // show/hide switch buttons
  document.getElementById('switchUserBtn').style.display = (updatedAllUsers.length > 1) ? 'inline-block' : 'none';
  document.getElementById('switchRoleBtn').style.display = (user.roles?.length > 1) ? 'inline-block' : 'none';

  // wire buttons
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
  });
  document.getElementById('cancelBtn').addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('switchRoleBtn').addEventListener('click', promptRoleSwitch);
  document.getElementById('switchUserBtn').addEventListener('click', promptUserSwitch);
  document.getElementById('saveBtn').addEventListener('click', e => { e.preventDefault(); saveSettings(); });

  // modal cancels
  document.getElementById('cancelUserSwitchBtn').addEventListener('click', () => {
    document.getElementById('userSwitchModal').style.display = 'none';
  });
  document.getElementById('cancelRoleSwitchBtn').addEventListener('click', () => {
    document.getElementById('roleSwitchModal').style.display = 'none';
  });

  if (sessionStorage.getItem('forceUserSwitch') === 'true') {
    sessionStorage.removeItem('forceUserSwitch');
    setTimeout(() => promptUserSwitch(), 400);
  }
});
/* === Append-only: flat 2D password toggles for Settings === */
(function () {
  function svgEyeOpen() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
          <circle cx="12" cy="12" r="3"/>
        </g>
      </svg>`;
  }
  function svgEyeClosed() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
          <circle cx="12" cy="12" r="3"/>
        </g>
        <line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" stroke-width="2"/>
      </svg>`;
  }
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
    btn.innerHTML = svgEyeOpen();
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!showing));
      btn.innerHTML = showing ? svgEyeOpen() : svgEyeClosed();
    });
    wrap.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addPwToggle(document.getElementById('currentPassword'));
    addPwToggle(document.getElementById('newPassword'));
  });
})();
