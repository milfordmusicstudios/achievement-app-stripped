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

    // ✅ Save to localStorage and redirect if no modal needed
    localStorage.setItem('loggedInUser', JSON.stringify(userData));
    const roles = userData.roles || ['student'];
    const defaultRole = roles.includes('admin') ? 'admin' :
                        roles.includes('teacher') ? 'teacher' : 'student';
    localStorage.setItem('activeRole', defaultRole);

    // ✅ Flag parent accounts so home.js can trigger child modal
localStorage.setItem('isParent', userData.roles.includes("parent"));


    console.log("DEBUG: No modal needed, redirecting to home");
    window.location.href = 'index.html';
  });
});
