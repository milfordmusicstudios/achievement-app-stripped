import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorMsg = document.getElementById('loginError');

  if (!form || !emailInput || !passwordInput) {
    console.error('[DEBUG] Login elements not found');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    errorMsg.textContent = '';

    if (!email || !password) {
      errorMsg.textContent = 'Please enter both email and password';
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('[DEBUG] Supabase login response:', data, error);

      if (error) {
        errorMsg.textContent = 'Invalid login credentials';
        return;
      }

      // fetch user profile from users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (profileError) {
        console.error('[DEBUG] Profile fetch error:', profileError);
      }

      if (profile) {
        localStorage.setItem('loggedInUser', JSON.stringify(profile));
        window.location.href = 'index.html';
      } else {
        errorMsg.textContent = 'User profile not found.';
      }
    } catch (err) {
      console.error('[DEBUG] Login failed:', err);
      errorMsg.textContent = 'An unexpected error occurred';
    }
  });
});
