import { supabase } from "./supabaseClient.js";

let teachersAvailable = false; // if no teachers exist, allow signup without selecting any
let teacherOptionData = [];    // cached teacher options for dynamic student blocks

function parseRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.map(r => String(r).toLowerCase());
  if (typeof roles === "string") {
    try {
      const parsed = JSON.parse(roles);
      return Array.isArray(parsed) ? parsed.map(r => String(r).toLowerCase()) : [String(parsed).toLowerCase()];
    } catch {
      return roles.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [String(roles).toLowerCase()];
}

function applyTeacherOptionsToSelect(selectEl) {
  if (!selectEl) return;

  // If no teachers exist, show the fail-safe option
  if (!teachersAvailable) {
    selectEl.innerHTML = "";
    selectEl.disabled = true;
    selectEl.required = false;

    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No teachers available — you may continue";
    selectEl.appendChild(opt);
    return;
  }

  // Teachers exist
  selectEl.disabled = false;
  selectEl.required = true;

  // Preserve selections if any
  const selected = new Set(Array.from(selectEl.selectedOptions || []).map(o => o.value));

  selectEl.innerHTML = "";
  teacherOptionData.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    if (selected.has(t.id)) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

// Simple helper for parsing instruments
function parseInstruments(raw) {
  return (raw || "")
    .split(",")
    .map(i => i.trim())
    .filter(Boolean);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const errorDisplay = document.getElementById("signupError");
  const emailInput = document.getElementById("signupEmail");
  const cancelBtn = document.getElementById("cancelBtn");
  const submitBtn = document.getElementById("submitBtn");

  // Prefill email if provided in query
  const params = new URLSearchParams(window.location.search);
  const inviteEmail = params.get("email");
  if (inviteEmail && emailInput) {
    emailInput.value = inviteEmail;
    emailInput.readOnly = true;
  }

  async function loadTeachers() {
    const { data: teachers, error } = await supabase
      .from("users")
      .select('id, "firstName", "lastName", roles');

    if (error) {
      console.error("Error loading teachers:", error);
      // If we can’t load teachers, act like none exist (fail-safe)
      teachersAvailable = false;
      teacherOptionData = [];
      document.querySelectorAll('select[id^="teacherIds"]').forEach(applyTeacherOptionsToSelect);
      return;
    }

    const teacherList = (teachers || [])
      .filter(t => {
        const roles = parseRoles(t.roles);
        return roles.includes("teacher") || roles.includes("admin");
      })
      .sort(
        (a, b) =>
          (a.lastName || "").localeCompare(b.lastName || "") ||
          (a.firstName || "").localeCompare(b.firstName || "")
      );

    teachersAvailable = teacherList.length > 0;

    teacherOptionData = teacherList.map(t => ({
      id: t.id,
      label: (`${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() || "Unnamed Teacher")
    }));

    // Apply options to ALL teacher selects (teacherIds, teacherIds2, teacherIds3, ...)
    document.querySelectorAll('select[id^="teacherIds"]').forEach(applyTeacherOptionsToSelect);
  }

  loadTeachers();

  // When a new student block is added, populate its teacher select
  document.getElementById("addStudentBtn")?.addEventListener("click", () => {
    setTimeout(() => {
      document.querySelectorAll('select[id^="teacherIds"]').forEach(applyTeacherOptionsToSelect);
    }, 0);
  });

  // Cancel Button → back to login
  cancelBtn?.addEventListener("click", () => {
    window.location.href = "login.html";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    errorDisplay.style.display = "none";
    errorDisplay.textContent = "";

    const email = (emailInput?.value || "").trim().toLowerCase();
    const password = document.getElementById("signupPassword")?.value || "";

    // Email/password required for auth signup
    if (!email || !password) {
      errorDisplay.textContent = "Email and password are required.";
      errorDisplay.style.display = "block";
      return;
    }

    // Build pending children from ALL student blocks
    const blocks = Array.from(document.querySelectorAll("#studentsContainer .student-block"));
    const pending = [];

    try {
      blocks.forEach((block, idx) => {
        const n = idx + 1;
        const suffix = (n === 1) ? "" : String(n);

        const firstName = (document.getElementById(`firstName${suffix}`)?.value || "").trim();
        const lastName  = (document.getElementById(`lastName${suffix}`)?.value || "").trim();
        const rawInst   = (document.getElementById(`instrument${suffix}`)?.value || "");
        const instruments = parseInstruments(rawInst);

        const teacherSel = document.getElementById(`teacherIds${suffix}`);
        const teacherIds = Array.from(teacherSel?.selectedOptions || []).map(o => o.value);

        // Optional students: ignore completely if no name entered
        if (n > 1 && !firstName && !lastName) return;

        // Validate student
        if (!firstName || !lastName) {
          throw new Error(`Student #${n} must have both first and last name.`);
        }
        if (instruments.length === 0) {
          throw new Error(`Please enter at least one instrument for Student #${n}.`);
        }
        if (teachersAvailable && teacherIds.length === 0) {
          throw new Error(`Please select at least one teacher for Student #${n}.`);
        }

        pending.push({ firstName, lastName, instruments, teacherIds });
      });

      if (pending.length === 0) {
        throw new Error("Please enter at least one student.");
      }

      // Prevent double-submit
      submitBtn.disabled = true;

      // Save drafts locally to finalize after email confirm + login
      localStorage.setItem("pendingChildren", JSON.stringify(pending));
      localStorage.setItem("pendingChildrenEmail", email);

      // Signup ONCE (parent auth)
      // Parent name metadata: use Student #1 name for now
      const parentFirst = pending[0]?.firstName || "";
      const parentLast  = pending[0]?.lastName || "";

const { data, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${window.location.origin}/auth-callback.html`,
  },
});

if (signUpError) throw signUpError;

      alert("Check your email to confirm your account, then log in.");
      window.location.href = "login.html";
      return;

    } catch (err) {
      console.error("Signup error:", err);
      errorDisplay.textContent = err.message || "Something went wrong. Please try again.";
      errorDisplay.style.display = "block";
      submitBtn.disabled = false;
      return;
    }
  });
});
