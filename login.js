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
      // ✅ Explicitly select required columns, including roles
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('id, firstName, lastName, email, roles, parent_uuid, avatarUrl')
        .eq('id', data.user.id)
        .single();

      if (fetchError) {
        console.error("Supabase fetch error:", fetchError);
        errorDisplay.style.display = 'block';
        errorDisplay.textContent = 'Error fetching user profile.';
        return;
      }

      if (!userData) {
        errorDisplay.style.display = 'block';
        errorDisplay.textContent = 'User profile not found.';
        return;
      }

      // ✅ Debug log to confirm roles
      console.log("DEBUG Supabase returned userData:", userData);

      // ✅ Normalize roles into an array
      if (typeof userData.roles === "string") {
        try {
          userData.roles = JSON.parse(userData.roles);
        } catch {
          userData.roles = userData.roles.split(",").map(r => r.trim());
        }
      } else if (!Array.isArray(userData.roles)) {
        userData.roles = userData.roles ? [userData.roles] : [];
      }

      console.log("DEBUG Normalized roles:", userData.roles);

      // ✅ Save normalized user to localStorage
      localStorage.setItem('loggedInUser', JSON.stringify(userData));

      // ✅ Set default role for activeRole
      const roles = userData.roles || ['student'];
      const defaultRole = roles.includes('admin') ? 'admin' :
                          roles.includes('teacher') ? 'teacher' : 'student';
      localStorage.setItem('activeRole', defaultRole);

      // Redirect to home
      window.location.href = 'index.html';
    }
  });
});
