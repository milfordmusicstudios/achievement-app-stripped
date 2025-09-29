// settings.js — complete replacement
import { supabase } from './supabase.js';

// Optional: try to import utils.recalculateUserPoints if it exists.
// If not, we safely no-op.
let recalculateUserPoints = async () => {};
try {
  const m = await import('./utils.js');
  if (typeof m.recalculateUserPoints === 'function') recalculateUserPoints = m.recalculateUserPoints;
} catch { /* ok if missing */ }

// ----- Helpers -----
function getHighestRole(roles) {
  const priority = { admin: 3, teacher: 2, student: 1, parent: 0 };
  if (!Array.isArray(roles)) return 'student';
  return roles
    .slice()
    .sort((a, b) => (priority[b?.toLowerCase()] ?? -1) - (priority[a?.toLowerCase()] ?? -1))[0];
}
function normalizeUUID(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
}
function cap(s){return s? s.charAt(0).toUpperCase()+s.slice(1):''}

// ----- Related users (parent/children/siblings) -----
async function fetchRelatedUsers(user) {
  const userIdStr = normalizeUUID(user.id);
  const parentIdStr = normalizeUUID(user.parent_uuid);
  let out = [];

  // children
  const { data: children } = await supabase.from('users').select('*').eq('parent_uuid', userIdStr);
  if (children?.length) out = children;

  // siblings (if this user has parent)
  if (parentIdStr) {
    const { data: siblings } = await supabase.from('users').select('*').eq('parent_uuid', parentIdStr);
    if (siblings?.length) {
      const filtered = siblings.filter(u => normalizeUUID(u.id) !== userIdStr);
      out = [...out, ...filtered];
    }
  }
  // dedupe by id
  const seen = new Set();
  return out.filter(u => (seen.has(u.id) ? false : seen.add(u.id)));
}

// ----- Switch User / Role -----
function promptUserSwitch() {
  const current = JSON.parse(localStorage.getItem('loggedInUser'));
  const allUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
  const list = document.getElementById('userSwitchList');
  list.innerHTML = '';

  allUsers.forEach(u => {
    if (normalizeUUID(u.id) === normalizeUUID(current.id)) return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'blue-button';
    btn.style = 'width:100%';
    const rolesText = Array.isArray(u.roles) ? u.roles.join(', ') : (u.role || '');
    btn.textContent = `${u.firstName || ''} ${u.lastName || ''} (${rolesText})`.trim();
    btn.onclick = async () => {
      localStorage.setItem('loggedInUser', JSON.stringify(u));
      localStorage.setItem('activeRole', getHighestRole(u.roles));
      try { await recalculateUserPoints(u.id); } catch {}
      window.location.href = 'index.html';
    };
    li.appendChild(btn);
    list.appendChild(li);
  });

  document.getElementById('userSwitchModal').style.display = 'flex';
}

function promptRoleSwitch() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  const roles = (Array.isArray(user.roles) ? user.roles : [user.role])
    .filter(Boolean)
    .map(r => r.toLowerCase())
    .filter(r => r !== 'parent'); // hide parent in the switcher

  const list = document.getElementById('roleSwitchList');
  list.innerHTML = '';
  roles.forEach(role => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'blue-button';
    btn.style = 'width:100%';
    btn.textContent = cap(role);
    btn.onclick = () => {
      localStorage.setItem('activeRole', role);
      window.location.href = 'index.html';
    };
    li.appendChild(btn);
    list.appendChild(li);
  });

  document.getElementById('roleSwitchModal').style.display = 'flex';
}

// ----- Eye toggles -----
function wireEyes() {
  const bind = (btnId, inputId) => {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  };
  bind('toggleCurrentPw', 'currentPassword');
  bind('toggleNewPw', 'newPassword');
}

// ----- Save -----
async function saveSettings() {
  const profile = JSON.parse(localStorage.getItem('loggedInUser'));
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  const isEditingOwnAccount = !!(authUser && authUser.id === profile.id);

  const currentEmail = profile.email || '';
  const newEmail = document.getElementById('newEmail').value.trim();
  const newPassword = document.getElementById('newPassword').value.trim();
  const currentPassword = document.getElementById('currentPassword').value.trim();

  const updatedUser = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: isEditingOwnAccount ? (newEmail || currentEmail) : currentEmail
  };

  try {
    // 1) Update profile fields in your users table
    const { error: dbError } = await supabase
      .from('users')
      .update(updatedUser)
      .eq('id', profile.id);
    if (dbError) throw dbError;

    // 2) Auth email/password only when editing your own account
    if (isEditingOwnAccount) {
      const emailChanged = !!(newEmail && newEmail !== currentEmail);
      const passwordChanged = !!newPassword;

      if ((emailChanged || passwordChanged) && !currentPassword) {
        alert('Please enter your current password to make changes.');
        return;
      }

      if (emailChanged || passwordChanged) {
        // Re-auth with the actual signed-in email
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

    // Update local cache and exit
    Object.assign(profile, updatedUser);
    localStorage.setItem('loggedInUser', JSON.stringify(profile));
    alert('Settings saved successfully!');
    window.location.href = 'index.html';
  } catch (err) {
    console.error('[settings] save error:', err);
    alert('Failed to update settings: ' + (err?.message || err));
  }
}

// ----- Init -----
document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  if (!user) { window.location.href = 'login.html'; return; }

  let activeRole = localStorage.getItem('activeRole');
  if (!activeRole && user.roles) {
    activeRole = getHighestRole(user.roles);
    localStorage.setItem('activeRole', activeRole);
  }

  // hydrate
  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value = user.lastName || '';
  document.getElementById('newEmail').value = user.email || '';
  document.getElementById('avatarImage').src = user.avatarUrl || 'images/logos/default.png';

  // determine own vs other profile
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  const isOwn = !!(authUser && authUser.id === user.id);

  const guard = document.getElementById('credsGuard');
  const emailInput = document.getElementById('newEmail');
  const curPw = document.getElementById('currentPassword');
  const newPw = document.getElementById('newPassword');
  const t1 = document.getElementById('toggleCurrentPw');
  const t2 = document.getElementById('toggleNewPw');

  if (!isOwn) {
    guard.style.display = 'block';
    [emailInput, curPw, newPw, t1, t2].forEach(el => { if (el) el.disabled = true; });
  } else {
    guard.style.display = 'none';
  }

  // Build related users list for switcher
  let allUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
  if (!allUsers.some(u => u.id === user.id)) allUsers.push(user);
  try {
    const related = await fetchRelatedUsers(user);
    related.forEach(ru => { if (!allUsers.some(u => u.id === ru.id)) allUsers.push(ru); });
    // dedupe
    allUsers = allUsers.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
    localStorage.setItem('allUsers', JSON.stringify(allUsers));
  } catch {}

  // Show/hide switch buttons
  document.getElementById('switchUserBtn').style.display = (allUsers.length > 1) ? 'inline-block' : 'none';

  const roles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
  const rolesMinusParent = roles.filter(r => (r || '').toLowerCase() !== 'parent');
  document.getElementById('switchRoleBtn').style.display = (rolesMinusParent.length > 1) ? 'inline-block' : 'none';

  // Wire buttons
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
  });
  document.getElementById('cancelBtn').addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('saveBtn').addEventListener('click', e => { e.preventDefault(); saveSettings(); });

  document.getElementById('switchRoleBtn').addEventListener('click', promptRoleSwitch);
  document.getElementById('switchUserBtn').addEventListener('click', promptUserSwitch);
  document.getElementById('cancelUserSwitchBtn').addEventListener('click', () => {
    document.getElementById('userSwitchModal').style.display = 'none';
  });
  document.getElementById('cancelRoleSwitchBtn').addEventListener('click', () => {
    document.getElementById('roleSwitchModal').style.display = 'none';
  });

  // honor any flow that forces a switch prompt
  if (sessionStorage.getItem('forceUserSwitch') === 'true') {
    sessionStorage.removeItem('forceUserSwitch');
    setTimeout(() => promptUserSwitch(), 400);
  }

  wireEyes();
});
