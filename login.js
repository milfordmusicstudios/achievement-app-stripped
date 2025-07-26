import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorMsg = document.getElementById('loginError');

  if (!form) {
    console.error('[DEBUG] Login form not found');
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
      // Supabase auth login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      console.log('[DEBUG] Supabase login response:', authData, authError);

      if (authError) {
        errorMsg.textContent = 'Invalid login credentials';
        return;
      }

      // Fetch all users with this email
      const { data: users, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email);

      if (profileError || !users || users.length === 0) {
        console.error('[DEBUG] Profile fetch error:', profileError);
        errorMsg.textContent = 'User profile not found.';
        return;
      }

      // Store the first matching user (parent) and let switching handle siblings later
      const mainUser = users[0];
      localStorage.setItem('loggedInUser', JSON.stringify(mainUser));

      console.log('[DEBUG] Logged in user stored:', mainUser);
      window.location.href = 'index.html';
    } catch (err) {
      console.error('[DEBUG] Login failed:', err);
      errorMsg.textContent = 'An unexpected error occurred';
    }
  });
});
