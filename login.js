// login.js
import { supabase } from "./supabaseClient.js";
import { ensureStudioContextAndRoute } from "./studio-routing.js";
import { ensureUserRow } from "./utils.js";

window.selectStudent = function(student) {
  console.log("DEBUG: Student selected", student?.id);
  localStorage.setItem('loggedInUser', JSON.stringify(student));
  localStorage.setItem('activeStudentId', student.id);
  document.getElementById('studentSelectOverlay')?.style && (document.getElementById('studentSelectOverlay').style.display = 'none');
  window.location.href = 'index.html';
};

window.cancelStudentSelect = function() {
  console.log("DEBUG: Student selection canceled");
  localStorage.clear();
  document.getElementById('studentSelectOverlay').style.display = 'none';
  window.location.href = 'login.html';
};

document.addEventListener("DOMContentLoaded", () => {
  console.log("DEBUG: login.js loaded");

  const form = document.getElementById('loginForm');
  const errorDisplay = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("DEBUG: Login form submitted");

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = 'Please enter both email and password.';
      return;
    }

    console.log("DEBUG: Attempting login for", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log("DEBUG: Auth response", data, error);

    if (error) {
      console.error("DEBUG: Login failed", error.message);
      errorDisplay.style.display = 'block';
      errorDisplay.textContent = 'Invalid email or password.';
      return;
    }

// ✅ Hydrate session before any RLS-protected table reads
const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
if (sessionErr || !sessionData?.session?.user) {
  console.error("DEBUG: Session hydration failed", sessionErr);
  errorDisplay.style.display = 'block';
  errorDisplay.textContent = 'Session not ready. Please try again.';
  return;
}

await ensureUserRow();

const userId = sessionData.session.user.id;
console.log("DEBUG: Login success, user id:", userId);

// --- FINALIZE PENDING CHILDREN (signup with multiple students) ---
const pendingEmail = (localStorage.getItem("pendingChildrenEmail") || "").toLowerCase();
const pendingRaw = localStorage.getItem("pendingChildren");
const pendingChildren = pendingRaw ? JSON.parse(pendingRaw) : [];
console.log("FINALIZE: pendingChildren =", pendingChildren);


const authEmail = (sessionData.session.user.email || "").toLowerCase();
const shouldFinalize = pendingChildren.length > 0 && pendingEmail === authEmail;

let kids = [];

if (shouldFinalize) {
  const parentId = userId;

  const rows = pendingChildren.map(c => ({
    firstName: c.firstName,
    lastName: c.lastName,
    roles: ["student"],
    parent_uuid: parentId,
    instrument: c.instruments,
    teacherIds: c.teacherIds,
    points: 0,
    level: 1,
    active: true,
    showonleaderboard: true
  }));

  const { error: insertErr } = await supabase.from("users").insert(rows);
  if (insertErr) {
    console.error("[Finalize] insert failed", insertErr);
    errorDisplay.textContent = "Failed to create student profiles.";
    errorDisplay.style.display = "block";
    return;
  }

  localStorage.removeItem("pendingChildren");
  localStorage.removeItem("pendingChildrenEmail");
}

// 🔑 ALWAYS fetch students by parent_uuid
const { data: children, error: kidsErr } = await supabase
  .from("users")
  .select("*")
  .eq("parent_uuid", userId)
  .order("created_at", { ascending: true });

if (kidsErr || !children?.length) {
  console.error("[Login] kids fetch failed:", kidsErr);
  errorDisplay.textContent = "No students found for this account.";
  errorDisplay.style.display = "block";
  return;
}

// Success: store student + redirect
localStorage.setItem("loggedInUser", JSON.stringify(children[0]));
localStorage.setItem("allUsers", JSON.stringify(children));
localStorage.setItem("activeRole", "student");
await ensureStudioContextAndRoute();
return;

  }); // end submit
});   // end DOMContentLoaded

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
