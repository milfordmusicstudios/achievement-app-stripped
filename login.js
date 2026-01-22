// login.js
import { supabase } from "./supabaseClient.js";
import { finalizePostAuth } from "./studio-routing.js";
import { ensureUserRow } from "./utils.js";
import { setActiveProfileId } from "./active-profile.js";

async function createStudioStudents(students, parentId, studioId) {
  if (!crypto?.randomUUID) {
    throw new Error("Browser does not support UUID generation.");
  }
  if (!studioId) {
    throw new Error("Missing activeStudioId for student creation.");
  }

  const rows = students.map(c => {
    const id = crypto.randomUUID();
    console.log("[PersonCreate] created new id", id);
    return {
      id,
      firstName: c.firstName,
      lastName: c.lastName,
      roles: ["student"],
      parent_uuid: parentId,
      instrument: c.instruments,
      teacherIds: c.teacherIds,
      points: 0,
      level: 1,
      active: true,
      studio_id: studioId,
      showonleaderboard: true
    };
  });

  const { error: insertErr } = await supabase.from("users").insert(rows);
  if (insertErr) throw insertErr;
}

window.selectStudent = function(student) {
  console.log("DEBUG: Student selected", student?.id);
  localStorage.setItem('loggedInUser', JSON.stringify(student));
  localStorage.setItem('activeStudentId', student.id);
  setActiveProfileId(student.id);
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
  const forgotBtn = document.getElementById('forgotPasswordBtn');
  const resetPanel = document.getElementById('resetPanel');
  const resetEmailInput = document.getElementById('resetEmail');
  const sendResetBtn = document.getElementById('sendResetBtn');
  const cancelResetBtn = document.getElementById('cancelResetBtn');
  const resetStatus = document.getElementById('resetStatus');

  const showResetStatus = (message, isError = false) => {
    if (!resetStatus) return;
    resetStatus.textContent = message || '';
    resetStatus.style.display = message ? 'block' : 'none';
    resetStatus.style.color = isError ? '#c62828' : '#0b7a3a';
  };

  if (forgotBtn && resetPanel) {
    forgotBtn.addEventListener('click', () => {
      resetPanel.style.display = 'block';
      const emailValue = document.getElementById('loginEmail')?.value?.trim() || '';
      if (resetEmailInput) resetEmailInput.value = emailValue;
      showResetStatus('');
    });
  }

  if (cancelResetBtn && resetPanel) {
    cancelResetBtn.addEventListener('click', () => {
      resetPanel.style.display = 'none';
      showResetStatus('');
    });
  }

  if (sendResetBtn) {
    sendResetBtn.addEventListener('click', async () => {
      const email = resetEmailInput?.value?.trim().toLowerCase() || '';
      if (!email) {
        showResetStatus('Please enter your email address.', true);
        return;
      }

      sendResetBtn.disabled = true;
      showResetStatus('');
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth-callback.html`
        });
        if (error) {
          showResetStatus(error.message || 'Failed to send reset email.', true);
        } else {
          showResetStatus('Check your email for a reset link.');
        }
      } catch (err) {
        showResetStatus(err?.message || 'Failed to send reset email.', true);
      } finally {
        sendResetBtn.disabled = false;
      }
    });
  }

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

const authUser = sessionData.session.user;
const userId = authUser.id;
console.log("[Login] authUserId/email", authUser.id, authUser.email);

const ensured = await ensureUserRow();
if (ensured) {
  localStorage.setItem("loggedInUser", JSON.stringify(ensured));
}
console.log("[Login] post-auth ok", { userId, email: authUser.email });

// --- FINALIZE PENDING CHILDREN (signup with multiple students) ---
const pendingEmail = (localStorage.getItem("pendingChildrenEmail") || "").toLowerCase();
const pendingRaw = localStorage.getItem("pendingChildren");
const pendingChildren = pendingRaw ? JSON.parse(pendingRaw) : [];
console.log("FINALIZE: pendingChildren =", pendingChildren);


const authEmail = (sessionData.session.user.email || "").toLowerCase();
const shouldFinalize = pendingChildren.length > 0 && pendingEmail === authEmail;


if (shouldFinalize) {
  try {
    const studioId = localStorage.getItem("activeStudioId");
    await createStudioStudents(pendingChildren, userId, studioId);
  } catch (err) {
    console.error("[Finalize] student create failed", err);
    errorDisplay.textContent = "Student creation failed.";
    errorDisplay.style.display = "block";
    return;
  }

  localStorage.removeItem("pendingChildren");
  localStorage.removeItem("pendingChildrenEmail");
}

await finalizePostAuth({ ensureUser: false, storeProfile: false });
console.log("[Login] routed");
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


