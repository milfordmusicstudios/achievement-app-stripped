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

    // ✅ Check if parent account has multiple children
    const { data: students, error: studentError } = await supabase
      .from('users')
      .select('id, "firstName", "lastName"')
      .eq('parent_uuid', userData.id);

    console.log("DEBUG: Student fetch", students, studentError);

    if (!studentError && students && students.length > 1) {
      console.log("DEBUG: Multiple students found, showing modal");
      const overlay = document.getElementById('studentSelectOverlay');
      const btnContainer = document.getElementById('studentButtons');
      btnContainer.innerHTML = '';

      students.forEach(st => {
        const btn = document.createElement('button');
        btn.textContent = `${st.firstName} ${st.lastName}`;
        btn.className = 'blue-button';
        btn.style.margin = '5px 0';
        btn.onclick = () => selectStudent(st.id, userData);
        btnContainer.appendChild(btn);
      });

      overlay.classList.add('show');
      overlay.style.display = 'flex';
      return; // ✅ prevent auto redirect
    }

    // ✅ Save to localStorage and redirect if no modal needed
    localStorage.setItem('loggedInUser', JSON.stringify(userData));
    const roles = userData.roles || ['student'];
    const defaultRole = roles.includes('admin') ? 'admin' :
                        roles.includes('teacher') ? 'teacher' : 'student';
    localStorage.setItem('activeRole', defaultRole);

    console.log("DEBUG: No modal needed, redirecting to home");
    window.location.href = 'index.html';
  });
});
