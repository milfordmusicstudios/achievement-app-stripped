import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById('signupForm');
  const errorDisplay = document.getElementById('signupError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;

    // Step 1: Create Auth user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      errorDisplay.textContent = signUpError.message;
      errorDisplay.style.display = 'block';
      return;
    }

    // Step 2: Wait for session to be fully ready
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      errorDisplay.textContent = "User session not established. Try logging in.";
      errorDisplay.style.display = 'block';
      return;
    }

    // Step 3: Insert into users table
    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      email,
      firstName,
      lastName,
      avatar: '',
      roles: ['student'],
      level: 1,
      points: 0
    });

    if (insertError) {
      errorDisplay.textContent = insertError.message;
      errorDisplay.style.display = 'block';
      return;
    }

    // Step 4: Go to home
    window.location.href = 'index.html';
  });
});
