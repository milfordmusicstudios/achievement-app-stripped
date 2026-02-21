// login.js
import { supabase } from "./supabaseClient.js";

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

document.addEventListener("DOMContentLoaded", () => {
  console.log("DEBUG: login.js loaded");

  const form = document.getElementById('loginForm');
  const errorDisplay = document.getElementById('loginError');
  const messageDisplay = document.getElementById('loginMessage');
  const forgotButton = document.getElementById('forgotPasswordBtn');
  const params = new URLSearchParams(window.location.search);

  const showError = (text) => {
    if (messageDisplay) {
      messageDisplay.style.display = 'none';
      messageDisplay.textContent = '';
    }
    if (errorDisplay) {
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = text;
    }
  };

  const showMessage = (text) => {
    if (errorDisplay) {
      errorDisplay.style.display = 'none';
      errorDisplay.textContent = '';
    }
    if (messageDisplay) {
      messageDisplay.style.display = 'block';
      messageDisplay.textContent = text;
    }
  };

  if (params.get('status') === 'reset-success') {
    showMessage('Password updated. Please log in.');
  }
  if (params.get('flow') === 'guard') {
    showError('Please sign in to continue.');
  }
  if (params.get('flow') === 'auth-callback' && params.get('error')) {
    showError('We could not complete the link. Please try again.');
  }

  const resetUrl = `${window.location.origin}/reset-password.html`;
  const emailInputGetter = () => document.getElementById('email');

  const disableForgotButton = (state, text) => {
    if (!forgotButton) return;
    forgotButton.disabled = state;
    forgotButton.textContent = text ?? 'Forgot password?';
  };

  const handleForgotPassword = async () => {
    const emailInput = emailInputGetter();
    const emailValue = emailInput?.value.trim().toLowerCase() ?? '';

    if (!emailValue) {
      showError('Enter your email to reset password.');
      emailInput?.focus();
      return;
    }

    if (!EMAIL_REGEX.test(emailValue)) {
      showError('Please enter a valid email address.');
      emailInput?.focus();
      return;
    }

    disableForgotButton(true, 'Sending...');
    try {
      await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: resetUrl,
      });
      showMessage('Password reset email sent. Check your inbox.');
    } catch (error) {
      console.error("[Login] reset password error", error);
      showError(error?.message || 'Unable to send reset email.');
    } finally {
      setTimeout(() => disableForgotButton(false, 'Forgot password?'), 10000);
    }
  };

  forgotButton?.addEventListener('click', handleForgotPassword);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("DEBUG: Login form submitted");

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('loginPassword');
    const email = emailInput?.value.trim().toLowerCase() ?? "";
    const password = passwordInput?.value.trim() ?? "";

    console.log(`[Login] email="${email}" pwLen=${password.length}`);

    if (!email || !password) {
      showError('Please enter both email and password.');
      return;
    }

    if (email.includes(" ") || !EMAIL_REGEX.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    console.log("DEBUG: Attempting login for", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log("DEBUG: Auth response", data, error);

    if (error) {
      console.error("DEBUG: Login failed", error.message);
      showError('Invalid email or password.');
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
      showError('Error fetching user profile.');
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
/* === Append-only: flat 2D password toggle for Login === */
(function () {
  function svgEyeOpen() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
          <circle cx="12" cy="12" r="3"/>
        </g>
      </svg>`;
  }
  function svgEyeClosed() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
          <circle cx="12" cy="12" r="3"/>
        </g>
        <line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" stroke-width="2"/>
      </svg>`;
  }
  function addPwToggle(input) {
    if (!input || input.dataset.hasToggle === '1') return;
    input.dataset.hasToggle = '1';

    const wrap = document.createElement('div');
    wrap.className = 'pw-field';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = svgEyeOpen();
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!showing));
      btn.innerHTML = showing ? svgEyeOpen() : svgEyeClosed();
    });
    wrap.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addPwToggle(document.getElementById('loginPassword'));
  });
})();
