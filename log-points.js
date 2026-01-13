import { supabase } from "./supabaseClient.js";
import { recalculateUserPoints } from './utils.js';
// =========================
// LOCAL DEMO MODE (no Supabase required)
// Triggered when:
// - URL has ?demo=1 OR
// - running on localhost/127.0.0.1 OR
// - opened via file://
// Safe for production: does not trigger on hosted domains.
// =========================
const DEMO_MODE = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') return true;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (window.location.protocol === 'file:') return true;
  } catch (e) {}
  return false;
})();

function demoSeedSession() {
  // Create a consistent demo user + role if missing
  const existing = localStorage.getItem('loggedInUser');
  const existingRole = localStorage.getItem('activeRole');
  if (!existing) {
    const demoUser = {
      id: 'demo-student-1',
      firstName: 'Demo',
      lastName: 'Student',
      avatarUrl: './images/bitmojis/default.png',
      roles: ['student'],
    };
    localStorage.setItem('loggedInUser', JSON.stringify(demoUser));
  }
  if (!existingRole) localStorage.setItem('activeRole', 'student');
}

function demoGetUser() {
  try {
    const raw = localStorage.getItem('loggedInUser');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function demoGetLogs() {
  try {
    const raw = localStorage.getItem('demoLogs');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function demoSaveLogs(logs) {
  localStorage.setItem('demoLogs', JSON.stringify(logs));
}

function demoComputePointsForUser(userId) {
  const logs = demoGetLogs().filter(l => l.userId === userId && (l.status || 'approved') === 'approved');
  return logs.reduce((sum, l) => sum + (Number(l.points) || 0), 0);
}

function demoLevels() {
  // Simple progressive thresholds; replace later with your real 12-level table if desired
  return [
    { level: 1, min: 0,   max: 99 },
    { level: 2, min: 100, max: 249 },
    { level: 3, min: 250, max: 449 },
    { level: 4, min: 450, max: 699 },
    { level: 5, min: 700, max: 999 },
    { level: 6, min: 1000, max: 1349 },
    { level: 7, min: 1350, max: 1749 },
    { level: 8, min: 1750, max: 2199 },
    { level: 9, min: 2200, max: 2699 },
    { level: 10, min: 2700, max: 3299 },
    { level: 11, min: 3300, max: 3999 },
    { level: 12, min: 4000, max: 999999 },
  ];
}

function demoLevelFromPoints(points) {
  const lvls = demoLevels();
  const match = lvls.find(l => points >= l.min && points <= l.max) || lvls[0];
  return match.level;
}


async function insertLogRow(row) {
  if (DEMO_MODE) {
    const logs = demoGetLogs();
    logs.push({
      id: `demo-log-${Date.now()}`,
      userId: row.user_id || row.userId || (demoGetUser()||{}).id || 'demo-student-1',
      category: row.category,
      points: Number(row.points)||0,
      date: row.date || new Date().toISOString().slice(0,10),
      note: row.note || row.notes || '',
      status: row.status || 'approved',
      createdAt: new Date().toISOString(),
    });
    demoSaveLogs(logs);
    return { data: logs[logs.length-1], error: null };
  }
  return await insertLogRow(row).select().single();
}


document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const categorySelect = document.getElementById("logCategory");
  const studentSelect = document.getElementById("logStudent");
  const previewImage = document.getElementById("previewImage");
  const pointsInput = document.getElementById("logPoints");
  const notesInput = document.getElementById("logNote");
  const dateInput = document.getElementById("logDate");
  const submitBtn = document.querySelector("button[type='submit']");
  const cancelBtn = document.querySelector("button[type='button']");

  // ✅ Default date to today
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }

  // ✅ Hide student dropdown & points input for students
  if (!(activeRole === "admin" || activeRole === "teacher")) {
    if (studentSelect) studentSelect.closest("tr").style.display = "none";
    if (pointsInput) pointsInput.closest("tr").style.display = "none";
  }

  // ✅ Show default category preview
  if (previewImage) previewImage.src = "images/categories/allCategories.png";

// URL prefill (from Home chips)
const urlParams = new URLSearchParams(window.location.search);
const PREFILL_CATEGORY = urlParams.get('category');
const PREFILL_HINT = urlParams.get('hint');
const PREFILL_MODE = urlParams.get('mode');

  // ✅ Load categories
  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("*")
    .order("id", { ascending: true });

  if (catErr) console.error("Error loading categories:", catErr.message);

  if (categories && categorySelect) {
    categorySelect.innerHTML = "<option value=''>Category</option>";
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.dataset.icon = cat.icon;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });

    // Prefill category when arriving from Home shortcuts
    if (PREFILL_CATEGORY) {
      categorySelect.value = PREFILL_CATEGORY;
      categorySelect.dispatchEvent(new Event('change'));
    }
    if (PREFILL_HINT) {
      const notesEl = document.getElementById('notes');
      if (notesEl && !notesEl.value) notesEl.placeholder = PREFILL_HINT;
    }

    // ✅ Category descriptions
const categoryDescriptions = {
  "practice": "Daily practice (5 point)s.",
  "participation": "Points for group class (50 points) or studio competitions (100 points).",
  "performance": "Points for recitals or other performances (100 points).",
  "personal": "Assigned by your teacher (5-100 points)",
  "proficiency": "Music Festival (100-200), Memorization (1 point per bar for vocals, 2 points per bar all other instruments ), Tests (50 points)."
};

const descBox = document.getElementById("categoryDescription");

categorySelect.addEventListener("change", () => {
  const selected = categorySelect.value.toLowerCase();
  if (descBox) descBox.textContent = categoryDescriptions[selected] || "";
});


    // ✅ Category preview
    categorySelect.addEventListener("change", () => {
      const selected = categorySelect.value;
      previewImage.src = selected ? `images/categories/${selected.toLowerCase()}.png` : "images/categories/allCategories.png";
      if (selected === "practice") {
        pointsInput.value = 5;
      } else if (pointsInput && (activeRole === "admin" || activeRole === "teacher")) {
        pointsInput.value = "";
      }
    });
  }

  // ✅ Populate students only for teachers/admins
  if ((activeRole === "admin" || activeRole === "teacher") && studentSelect) {
    const { data: students, error: stuErr } = await supabase
      .from("users")
      .select("id, firstName, lastName, roles, teacherIds");

    if (stuErr) {
      console.error("Supabase error loading students:", stuErr.message);
    } else if (students) {
      const filtered = students.filter(s => {
        const roles = Array.isArray(s.roles) ? s.roles : [s.roles];
        const isStudent = roles.includes("student");

        if (activeRole === "admin") return isStudent;

        if (activeRole === "teacher") {
          const teacherList = Array.isArray(s.teacherIds) ? s.teacherIds : [];
          return isStudent && teacherList.includes(user.id);
        }

        return false;
      });

      // ✅ Sort students alphabetically
      const sorted = filtered.sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // ✅ Populate dropdown
      studentSelect.innerHTML = "<option value=''>Select a student</option>";
      sorted.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.firstName} ${s.lastName}`;
        studentSelect.appendChild(opt);
      });
    }
  }

  // ✅ Submit log
  if (submitBtn) {
    submitBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      const category = categorySelect?.value;
      const note = notesInput?.value.trim();
      const date = dateInput?.value;

      const targetUser =
        (activeRole === "admin" || activeRole === "teacher") && studentSelect.value
          ? studentSelect.value
          : user.id;

      let points = 5; // default for practice
      if (activeRole === "admin" || activeRole === "teacher") {
        const enteredPoints = parseInt(pointsInput?.value);
        if (!isNaN(enteredPoints)) points = enteredPoints;
      }

      if (!category || !date) {
        alert("Please complete category and date.");
        return;
      }

      // ✅ Determine status
      let status = "pending";
      if (activeRole === "admin" || activeRole === "teacher" || category.toLowerCase() === "practice") {
        status = "approved";
      }

      const { error: logErr } = await supabase.from("logs").insert([{
        userId: targetUser,
        category,
        notes: note,
        date,
        points,
        status
      }]);

      if (logErr) {
        console.error("Failed to save log:", logErr.message);
        alert("Error saving log.");
        return;
      }

// ✅ Recalculate user points & allow Level Up popup to trigger
await recalculateUserPoints(targetUser);

// ✅ Wait a moment to ensure Level Up popup appears first
await new Promise(resolve => setTimeout(resolve, 1500));

// ✅ Always show success popup clearly
const popup = document.createElement("div");
popup.innerHTML = `
  <div style="
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6);
    display: flex; justify-content: center; align-items: center;
    z-index: 9999; /* Make sure it's on top */
  ">
    <div style="background:white; padding:30px; border-radius:12px; text-align:center; max-width:300px; box-shadow:0 2px 10px rgba(0,0,0,0.3);">
      <h3 style="color:#00477d; margin-bottom:15px;">✅ Log submitted successfully!</h3>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button id="goHomeBtn" class="blue-button">Go to Home</button>
        <button id="logMoreBtn" class="blue-button">Log More Points</button>
      </div>
    </div>
  </div>
`;
document.body.appendChild(popup);

// ✅ Safely attach listeners after DOM insert
setTimeout(() => {
  const goHomeBtn = document.getElementById("goHomeBtn");
  const logMoreBtn = document.getElementById("logMoreBtn");

  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      popup.remove();
      window.location.href = "index.html";
    });
  }

  if (logMoreBtn) {
    logMoreBtn.addEventListener("click", () => {
      popup.remove();
      document.getElementById("logForm").reset();

      // Reset date and hide fields if student
      if (dateInput) {
        const today = new Date().toISOString().split("T")[0];
        dateInput.value = today;
      }
      if (!(activeRole === "admin" || activeRole === "teacher")) {
        if (studentSelect) studentSelect.closest("tr").style.display = "none";
        if (pointsInput) pointsInput.closest("tr").style.display = "none";
      }
    });
  }
}, 100);
    });
  }

  // ✅ Cancel → home
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
});