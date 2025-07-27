// login.js
import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById('loginForm');
  const errorDisplay = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = 'Please enter both email and password.';
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = 'Invalid email or password.';
    } else {
      // Fetch user profile from 'users' table
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (!userData) {
        errorDisplay.style.display = 'block';
        errorDisplay.textContent = 'User profile not found.';
        return;
      }

// ✅ Ensure roles is always an array before saving
if (typeof userData.roles === "string") {
  try {
    userData.roles = JSON.parse(userData.roles);
  } catch {
    userData.roles = userData.roles.split(",").map(r => r.trim());
  }
} else if (!Array.isArray(userData.roles)) {
  userData.roles = userData.roles ? [userData.roles] : [];
}

// ✅ Save to localStorage with normalized roles
localStorage.setItem('loggedInUser', JSON.stringify(userData));
console.log("DEBUG login.js userData before save:", userData);

      // Set default role
      const roles = userData.roles || ['student'];
      const defaultRole = roles.includes('admin') ? 'admin' :
                          roles.includes('teacher') ? 'teacher' : 'student';

      localStorage.setItem('activeRole', defaultRole);

      // Redirect
      window.location.href = 'index.html';
    }
  });
});