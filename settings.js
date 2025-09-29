import { supabase } from './supabase.js';
import { recalculateUserPoints } from './utils.js';

function getHighestRole(roles) {
  const priority = { admin: 3, teacher: 2, student: 1, parent: 0 };
  if (!Array.isArray(roles)) return 'student';
  return roles.slice().sort((a, b) => (priority[b.toLowerCase()] ?? -1) - (priority[a.toLowerCase()] ?? -1))[0];
}

function normalizeUUID(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

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

function promptUserSwitch() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));

  // ✅ Only allow if user has "parent" role
  const roles = Array.isArray(user.roles) ? user.roles.map(r => r.toLowerCase()) : [];
  if (!roles.includes('parent')) {
    return; // Do nothing if not a parent
  }

  const allUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
  const userIdStr = normalizeUUID(user.id);
  const listContainer = document.getElementById('userSwitchList');
  listContainer.innerHTML = '';

  allUsers.forEach(u => {
    if (normalizeUUID(u.id) === userIdStr) return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'blue-button';
    btn.style = 'margin: 5px 0; width: 100%;';
    btn.textContent = `${u.firstName} ${u.lastName} (${Array.isArray(u.roles) ? u.roles.join(', ') : ''})`;
    btn.onclick = async () => {
      const userToStore = { ...u };
      localStorage.setItem('loggedInUser', JSON.stringify(userToStore));
      localStorage.setItem('activeRole', getHighestRole(u.roles));
      await recalculateUserPoints(userToStore.id);
      window.location.href = 'index.html';
    };
    li.appendChild(btn);
    listContainer.appendChild(li);
  });

  document.getElementById('userSwitchModal').style.display = 'flex';
}

function promptRoleSwitch() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  const roles = (Array.isArray(user.roles) ? user.roles : [user.role]).filter(r => r.toLowerCase() !== 'parent');
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

async function saveSettings() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  const currentEmail = user.email;
  const newEmail = document.getElementById('newEmail').value.trim();
  const newPassword = document.getElementById('newPassword').value.trim();
  const currentPassword = document.getElementById('currentPassword').value.trim();

  const updatedUser = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    email: newEmail || currentEmail
  };

  try {
    let emailChanged = newEmail && newEmail !== currentEmail;
    let passwordChanged = newPassword && newPassword.length > 0;

    if ((emailChanged || passwordChanged) && !currentPassword) {
      alert('Please enter your current password to make changes.');
      return;
    }

    if (emailChanged || passwordChanged) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
      if (signInError) {
        alert('Current password is incorrect.');
        return;
      }
    }

    if (emailChanged) {
      const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
      if (emailError) {
        alert('Failed to update email: ' + emailError.message);
        return;
      }
      alert('Check your new email to confirm the change.');
    }

    if (passwordChanged) {
      const { error: passError } = await supabase.auth.updateUser({ password: newPassword });
      if (passError) {
        alert('Failed to update password: ' + passError.message);
        return;
      }
      alert('Password updated successfully.');
    }

    const { error: dbError } = await supabase.from('users').update(updatedUser).eq('id', user.id);
    if (dbError) throw dbError;

    Object.assign(user, updatedUser);
    localStorage.setItem('loggedInUser', JSON.stringify(user));
    alert('Settings saved successfully!');
    window.location.href = 'index.html';
  } catch (err) {
    console.error('[ERROR] Save settings failed:', err);
    alert('Failed to update settings: ' + err.message);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  let activeRole = localStorage.getItem('activeRole');
  if (!activeRole && user.roles) {
    activeRole = getHighestRole(user.roles);
    localStorage.setItem('activeRole', activeRole);
  }
  if (!user || !activeRole) {
    alert('You must be logged in.');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('firstName').value = user.firstName || '';
  document.getElementById('lastName').value = user.lastName || '';
  document.getElementById('newEmail').value = user.email || '';
  document.getElementById('avatarImage').src = user.avatarUrl || 'images/logos/default.png';

  let updatedAllUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
  if (!updatedAllUsers.some(u => u.id === user.id)) updatedAllUsers.push(user);
  const relatedUsers = await fetchRelatedUsers(user);
  relatedUsers.forEach(ru => {
    if (!updatedAllUsers.some(u => u.id === ru.id)) updatedAllUsers.push(ru);
  });
  updatedAllUsers = updatedAllUsers.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
  localStorage.setItem('allUsers', JSON.stringify(updatedAllUsers));

  document.getElementById('switchUserBtn').style.display = (updatedAllUsers.length > 1) ? 'inline-block' : 'none';
  document.getElementById('switchRoleBtn').style.display = (user.roles?.length > 1) ? 'inline-block' : 'none';

  document.getElementById('logoutBtn').addEventListener('click', () => { localStorage.clear(); window.location.href = 'login.html'; });
  document.getElementById('cancelBtn').addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('switchRoleBtn').addEventListener('click', promptRoleSwitch);
  document.getElementById('switchUserBtn').addEventListener('click', promptUserSwitch);
  document.getElementById('saveBtn').addEventListener('click', e => { e.preventDefault(); saveSettings(); });

  // ✅ Cancel button for Switch User modal
  document.getElementById('cancelUserSwitchBtn').addEventListener('click', () => {
    document.getElementById('userSwitchModal').style.display = 'none';
  });

  // ✅ Cancel button for Switch Role modal
  document.getElementById('cancelRoleSwitchBtn').addEventListener('click', () => {
    document.getElementById('roleSwitchModal').style.display = 'none';
  });

  if (sessionStorage.getItem('forceUserSwitch') === 'true') {
    sessionStorage.removeItem('forceUserSwitch');
    setTimeout(() => promptUserSwitch(), 400);
  }
});
