// settings.js — patched to fix password/email updates with switched profiles
import { supabase } from './supabase.js';
import { recalculateUserPoints } from './utils.js';

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

// ---------- related users (parent/children/siblings) ----------
async function fetchRelatedUsers(user) {
  const userIdStr = normalizeUUID(user.id);
  const parentIdStr = normalizeUUID(user.parent_uuid);
  let sameGroupUsers = [];

  const { data: children } = await supabase.from('users').select('*').eq('parent_uuid', userIdStr);
  if (children?.length) {
    sameGroupUsers = children;
  } else if (parentIdStr) {
    const { data: siblings } = await supabase.from('users').select('*').eq('parent_uuid', parentIdStr);
    if (siblings?.length) sameGroupUsers = siblings.filter(u => normalizeUUID(u.id) !== userIdStr);
  }
  return sameGroupUsers;
}

// ---------- UI: switchers ----------
// REPLACE your existing promptUserSwitch() with this:
function promptUserSwitch() {
  const current = JSON.parse(localStorage.getItem('loggedInUser')) || {};
  const allUsers = JSON.parse(localStorage.getItem('allUsers')) || [];

  // Must have at least one *other* profile to switch to
  const others = allUsers.filter(u => u.id !== current.id);
  if (others.length === 0) {
    alert('No other profiles are linked to this login yet.');
    return;
  }

  const listContainer = document.getElementById('userSwitchList');
  listContainer.innerHTML = '';

  others.forEach(u => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'blue-button';
    btn.style = 'margin: 5px 0; width: 100%;';
    const rolesText = Array.isArray(u.roles) ? u.roles.join(', ') : (u.role || '');
    btn.textContent = `${u.firstName ?? ''} ${u.lastName ?? ''} (${rolesText})`.trim();
    btn.onclick = async () => {
      localStorage.setItem('loggedInUser', JSON.stringify(u));
      // keep your existing "highest role" logic if present
      const priority = { admin:3, teacher:2, student:1, parent:0 };
      const roles = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
      const highest = roles.slice().sort((a,b)=>(priority[b?.toLowerCase()]??-1)-(priority[a?.toLowerCase()]??-1))[0] || 'student';
      localStorage.setItem('activeRole', highest);

      try {
        // if you have this util, it's okay to call; otherwise it just fails silently
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
  const profile = JSON.parse(localStorage.getItem('loggedInUser')) || {};
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
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  let activeRole = localStorage.getItem('activeRole');
  if (!activeRole && user?.roles) {
    activeRole = getHighestRole(user.roles);
    localStorage.setItem('activeRole', activeRole);
  }
  if (!user || !activeRole) {
    alert('You must be logged in.');
    window.location.href = 'index.html';
    return;
  }

  // hydrate fields
  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value  = user.lastName  || '';
  document.getElementById('newEmail').value  = user.email     || '';
  document.getElementById('avatarImage').src = user.avatarUrl || 'images/logos/default.png';

  // determine if viewing own account for creds guard
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  applyCredsGuard(!!(authUser && authUser.id === user.id));

  // build related users list for switcher
  let updatedAllUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
  if (!updatedAllUsers.some(u => u.id === user.id)) updatedAllUsers.push(user);
  const relatedUsers = await fetchRelatedUsers(user);
  relatedUsers.forEach(ru => { if (!updatedAllUsers.some(u => u.id === ru.id)) updatedAllUsers.push(ru); });
  updatedAllUsers = updatedAllUsers.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
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
