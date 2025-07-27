import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById('signupForm');
  const errorDisplay = document.getElementById('signupError');
  const emailInput = document.getElementById('signupEmail');
  const cancelBtn = document.getElementById('cancelBtn');

  // ✅ Pre-fill email from ?email=
  const params = new URLSearchParams(window.location.search);
  const inviteEmail = params.get("email");
  if (inviteEmail) {
    emailInput.value = inviteEmail;
    emailInput.readOnly = true;
  }

  // ✅ Cancel button
  cancelBtn.addEventListener("click", () => {
    window.location.href = "login.html";
  });

  // ✅ Sign Up flow
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;

    // Step 1: Create Auth user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      errorDisplay.textContent = signUpError.message;
      errorDisplay.style.display = 'block';
      return;
    }

    // Step 2: Wait for session
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) {
      errorDisplay.textContent = "User session not established. Try logging in.";
      errorDisplay.style.display = 'block';
      return;
    }

    // Step 3: Insert user profile
    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      email,
      firstName,
      lastName,
      roles: ['student'],
      level: 1,
      points: 0
    });
    if (insertError) {
      errorDisplay.textContent = insertError.message;
      errorDisplay.style.display = 'block';
      return;
    }

    window.location.href = 'index.html';
  });
});
