import { supabase } from "./supabaseClient.js";

let teachersAvailable = false; // 🔑 FAIL-SAFE FLAG

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById('signupForm');
  const errorDisplay = document.getElementById('signupError');
  const emailInput = document.getElementById('signupEmail');
  const cancelBtn = document.getElementById('cancelBtn');
  const submitBtn = document.getElementById('submitBtn');

  // ✅ Pre-fill email if provided in query
  const params = new URLSearchParams(window.location.search);
  const inviteEmail = params.get("email");
  if (inviteEmail) {
    emailInput.value = inviteEmail;
    emailInput.readOnly = true;
  }

  // ✅ Load Teachers into Multi-Select (supports roles as array or string)
async function loadTeachers() {
  const { data: teachers, error } = await supabase
    .from("users")
    .select('id, "firstName", "lastName", roles');

  if (error) {
    console.error("Error loading teachers:", error);
    return;
  }

  const teacherSelect = document.getElementById("teacherIds");
  teacherSelect.innerHTML = "";

    const isTeacherish = (roles) => {
      if (!roles) return false;
      let arr = roles;
      if (typeof roles === "string") {
        try { arr = JSON.parse(roles); }
        catch { arr = roles.split(",").map(r => r.trim()); }
      }
      if (!Array.isArray(arr)) arr = [arr];
      arr = arr.map(r => String(r).toLowerCase());
      return arr.includes("teacher") || arr.includes("admin");
    };

    const teacherList = teachers
      .filter(t => isTeacherish(t.roles))
      .sort(
        (a,b) =>
          (a.lastName||"").localeCompare(b.lastName||"") ||
          (a.firstName||"").localeCompare(b.firstName||"")
      );

    teachersAvailable = teacherList.length > 0;

    if (!teachersAvailable) {
      // 🚨 FAIL-SAFE: no teachers exist
      teacherSelect.disabled = true;
      teacherSelect.required = false;

      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No teachers available — you may continue";
      teacherSelect.appendChild(opt);

      return; // stop here
    }

    // Teachers exist → normal behavior
    teacherSelect.disabled = false;
    teacherSelect.required = true;

    teacherList.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent =
        `${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() || "Unnamed Teacher";
      teacherSelect.appendChild(opt);
    });
  }
  loadTeachers();

  // ✅ Cancel Button → back to login
  cancelBtn.addEventListener("click", () => {
    window.location.href = "login.html";
  });

  // Simple helper for parsing instruments
  function parseInstruments(raw) {
    return (raw || "")
      .split(",")
      .map(i => i.trim())
      .filter(Boolean);
  }

  // ✅ Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDisplay.style.display = 'none';
    errorDisplay.textContent = '';

    // Required fields
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const instrumentRaw = document.getElementById('instrument').value;
    const instruments = parseInstruments(instrumentRaw);
    const teacherIds = Array.from(document.getElementById('teacherIds').selectedOptions).map(o => o.value);

    // ✅ Client-side validation for required multi-select + instruments
    if (instruments.length === 0) {
      errorDisplay.textContent = "Please enter at least one instrument.";
      errorDisplay.style.display = 'block';
      return;
    }
if (teachersAvailable && teacherIds.length === 0) {
  errorDisplay.textContent = "Please select at least one teacher.";
  errorDisplay.style.display = 'block';
  return;
}

    // Quick HTML validation for other required fields
    if (!firstName || !lastName || !email || !password) {
      errorDisplay.textContent = "First name, last name, email, and password are required.";
      errorDisplay.style.display = 'block';
      return;
    }

    // Avoid double-submit
    submitBtn.disabled = true;

    try {
const { data: signUpData, error: signUpError } =
  await supabase.auth.signUp({
    email,
    password,
    options: {
emailRedirectTo: `${window.location.origin}/login.html`
    }
  });

if (signUpError) {
  console.error("SIGNUP ERROR OBJECT:", signUpError);
  throw signUpError;
}

      const userId = signUpData.user?.id;
      if (!userId) {
        throw new Error("Signup failed. Try again.");
      }



alert("Check your email to confirm your account, then log in.");
window.location.href = "login.html";
return;

} catch (err) {
      console.error("Signup error:", err);
      errorDisplay.textContent = err.message || "Something went wrong. Please try again.";
      errorDisplay.style.display = 'block';
      submitBtn.disabled = false;
      return;
    }
  });
});
