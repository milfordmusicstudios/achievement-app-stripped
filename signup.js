import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById('signupForm');
  const errorDisplay = document.getElementById('signupError');
  const emailInput = document.getElementById('signupEmail');
  const cancelBtn = document.getElementById('cancelBtn');

  // ✅ Pre-fill email if provided in query
  const params = new URLSearchParams(window.location.search);
  const inviteEmail = params.get("email");
  if (inviteEmail) {
    emailInput.value = inviteEmail;
    emailInput.readOnly = true;
  }

  // ✅ Load Teachers into Multi-Select
  async function loadTeachers() {
    const { data: teachers, error } = await supabase.from("users").select("id, firstName, lastName, roles");
    if (error) {
      console.error("Error loading teachers:", error);
      return;
    }
    const teacherSelect = document.getElementById("teacherIds");
    teachers
      .filter(t => Array.isArray(t.roles) && (t.roles.includes("teacher") || t.roles.includes("admin")))
      .forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.firstName} ${t.lastName}`;
        teacherSelect.appendChild(opt);
      });
  }
  loadTeachers();

  // ✅ Cancel Button → back to login
  cancelBtn.addEventListener("click", () => {
    window.location.href = "login.html";
  });

  // ✅ Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDisplay.style.display = 'none';

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const instrument = document.getElementById('instrument').value.split(",").map(i => i.trim()).filter(Boolean);
    const teacherIds = Array.from(document.getElementById('teacherIds').selectedOptions).map(o => o.value);

    // ✅ Step 1: Sign Up Auth User
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      errorDisplay.textContent = signUpError.message;
      errorDisplay.style.display = 'block';
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      errorDisplay.textContent = "Signup failed. Try again.";
      errorDisplay.style.display = 'block';
      return;
    }

    // ✅ Step 2: Upload Avatar (if provided)
    let avatarUrl = null;
    const avatarFile = document.getElementById('avatarInput').files[0];
    if (avatarFile) {
      const fileName = `${userId}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, avatarFile, { upsert: true });
      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(fileName);
        avatarUrl = publicUrl.publicUrl;
      }
    }

    // ✅ Step 3: Insert into Custom Users Table
    const { error: insertError } = await supabase.from('users').insert([{
      id: userId,
      firstName,
      lastName,
      email,
      instrument,
      teacherIds,
      avatarUrl,
      roles: ['student'],
      points: 0
    }]);

    if (insertError) {
      errorDisplay.textContent = insertError.message;
      errorDisplay.style.display = 'block';
      return;
    }

    // ✅ Success → redirect to login
    alert("Signup successful! You may now log in.");
    window.location.href = 'login.html';
  });
});
