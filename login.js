// login.js
import { supabase } from './supabase.js';

window.selectStudent = function(studentId, parentData) {
  console.log("DEBUG: Student selected", studentId);
  localStorage.setItem('activeStudentId', studentId);
  localStorage.setItem('loggedInUser', JSON.stringify(parentData));
  document.getElementById('studentSelectOverlay').style.display = 'none';
  window.location.href = 'index.html';
};

window.cancelStudentSelect = function() {
  console.log("DEBUG: Student selection canceled");
  localStorage.clear();
  document.getElementById('studentSelectOverlay').style.display = 'none';
  window.location.href = 'login.html';
};

document.addEventListener("DOMContentLoaded", () => {
  console.log("DEBUG: login.js loaded");

  const form = document.getElementById('loginForm');
  const errorDisplay = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("DEBUG: Login form submitted");

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = 'Please enter both email and password.';
      return;
    }

    console.log("DEBUG: Attempting login for", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log("DEBUG: Auth response", data, error);

    if (error) {
      console.error("DEBUG: Login failed", error.message);
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = 'Invalid email or password.';
      return;
    }

    console.log("DEBUG: Login success, user id:", data.user.id);

    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('id, firstName, lastName, email, roles, parent_uuid, avatarUrl, teacherIds, instrument')
      .eq('id', data.user.id)
      .single();

    console.log("DEBUG: User fetch result", userData, fetchError);

    if (fetchError || !userData) {
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = 'Error fetching user profile.';
      return;
    }

    // ✅ Normalize roles
    if (typeof userData.roles === "string") {
      try { userData.roles = JSON.parse(userData.roles); } 
      catch { userData.roles = userData.roles.split(",").map(r => r.trim()); }
    } else if (!Array.isArray(userData.roles)) {
      userData.roles = userData.roles ? [userData.roles] : [];
    }

    if ((!userData.roles || userData.roles.length === 0) && userData.email === "lisarachelle85@gmail.com") {
      console.warn("Roles missing, applying fallback for admin.");
      userData.roles = ["teacher", "admin"];
    }

    console.log("DEBUG: Normalized roles", userData.roles);

    // ✅ Save user and determine role
    localStorage.setItem('loggedInUser', JSON.stringify(userData));
    const normalizedRoles = (userData.roles || ['student']).map(r => r.toLowerCase());
    const defaultRole = normalizedRoles.includes('admin') ? 'admin' :
                        normalizedRoles.includes('teacher') ? 'teacher' :
                        normalizedRoles.includes('parent') ? 'parent' : 'student';
    localStorage.setItem('activeRole', defaultRole);

    // ✅ Redirect based on role
    if (normalizedRoles.includes('parent')) {
      console.log("DEBUG: Parent role detected – redirecting directly to settings");
      sessionStorage.setItem("forceUserSwitch", "true");
      window.location.href = 'settings.html';  // ✅ relative path avoids 404 on Vercel
    } else {
      console.log("DEBUG: Redirecting to home");
      window.location.href = 'index.html';
    }
  });
});
