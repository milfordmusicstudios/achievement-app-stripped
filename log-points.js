import { supabase } from './supabase.js';
import { recalculateUserPoints } from './utils.js';

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

// ✅ Default date to today
if (dateInput) {
  const today = new Date().toISOString().split("T")[0];
  dateInput.value = today;
}
  const submitBtn = document.querySelector("button[type='submit']");
  const cancelBtn = document.querySelector("button[type='button']");

  // ✅ Hide student dropdown & points input for students
  if (!(activeRole === "admin" || activeRole === "teacher")) {
    if (studentSelect) studentSelect.closest("tr").style.display = "none";
    if (pointsInput) pointsInput.closest("tr").style.display = "none";
  }

  // ✅ Show default category preview
  if (previewImage) previewImage.src = "images/categories/allCategories.png";

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

// ✅ Sort students alphabetically by First Name, then Last Name
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

      const targetUser = (activeRole === "admin" || activeRole === "teacher") && studentSelect.value
        ? studentSelect.value
        : user.id;

let points = 5; // ✅ default for practice

// ✅ If teacher/admin, allow manual override
if (activeRole === "admin" || activeRole === "teacher") {
  const enteredPoints = parseInt(pointsInput?.value);
  if (!isNaN(enteredPoints)) {
    points = enteredPoints;
  }
}

      if (!category || !date) {
        alert("Please complete category and date.");
        return;
      }

// ✅ Determine status
let status = "pending";

// ✅ Any log created by teacher/admin is auto-approved
if (activeRole === "admin" || activeRole === "teacher") {
  status = "approved";
}

// ✅ Any practice log is auto-approved (even if student created it)
if (category.toLowerCase() === "practice") {
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
      } else {
      await recalculateUserPoints(targetUser);

// ✅ Custom popup instead of auto-redirect
const popup = document.createElement("div");
popup.style.position = "fixed";
popup.style.top = "0";
popup.style.left = "0";
popup.style.width = "100%";
popup.style.height = "100%";
popup.style.background = "rgba(0,0,0,0.6)";
popup.style.display = "flex";
popup.style.justifyContent = "center";
popup.style.alignItems = "center";
popup.style.zIndex = "1000";

popup.innerHTML = `
  <div style="background:white; padding:30px; border-radius:12px; text-align:center; max-width:300px; box-shadow:0 2px 10px rgba(0,0,0,0.3);">
    <h3 style="color:#00477d; margin-bottom:15px;">✅ Log submitted successfully!</h3>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <button id="goHomeBtn" class="blue-button">Go to Home</button>
      <button id="logMoreBtn" class="blue-button">Log More Points</button>
    </div>
  </div>
`;

// Append popup
document.body.appendChild(popup);

// Handle buttons
document.getElementById("goHomeBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("logMoreBtn").addEventListener("click", () => {
  document.body.removeChild(popup);
  document.getElementById("logForm").reset();
 // ✅ Re-apply today's date after reset
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }

  if (!(activeRole === "admin" || activeRole === "teacher")) {
    // re-hide fields for students
    if (studentSelect) studentSelect.closest("tr").style.display = "none";
    if (pointsInput) pointsInput.closest("tr").style.display = "none";
  }
});
      }
    });
  }

  // ✅ Cancel → home
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
});
