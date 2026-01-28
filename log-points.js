import { supabase } from "./supabaseClient.js";
import { recalculateUserPoints } from './utils.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const categorySelect = document.getElementById("logCategory");
  const studentRow = document.getElementById("logStudentRow");
  const studentSearchInput = document.getElementById("logStudentSearch");
  const studentResults = document.getElementById("logStudentResults");
  const studentChips = document.getElementById("logStudentChips");
  const studentHidden = document.getElementById("logStudent");
  const clearLogStudentBtn = document.getElementById("clearLogStudent");
  const previewImage = document.getElementById("previewImage");
  const pointsInput = document.getElementById("logPoints");
  const notesInput = document.getElementById("logNote");
  const dateInput = document.getElementById("logDate");
  const submitBtn = document.querySelector("button[type='submit']");
  const cancelBtn = document.querySelector("button[type='button']");

  let availableStudents = [];
  const selectedStudents = new Map();

  function formatStudentName(student) {
    if (!student) return "";
    const first = student.firstName || "";
    const last = student.lastName || "";
    const name = `${last}, ${first}`.trim();
    return name.length ? name : `${first} ${last}`.trim();
  }

  function updateLogStudentHidden() {
    if (!studentHidden) return;
    studentHidden.value = Array.from(selectedStudents.keys()).join(",");
  }

  function renderLogStudentChips() {
    if (!studentChips) return;
    if (!selectedStudents.size) {
      studentChips.innerHTML = "";
      return;
    }
    studentChips.innerHTML = Array.from(selectedStudents.values())
      .map(student => {
        const name = formatStudentName(student);
        return `
        <span class="student-chip">
          ${name}
          <button type="button" data-remove-student="${student.id}" aria-label="Remove ${name}">&times;</button>
        </span>`;
      })
      .join("");
  }

  function renderLogStudentResults() {
    if (!studentResults) return;
    const query = (studentSearchInput?.value || "").trim().toLowerCase();
    if (!query) {
      studentResults.style.display = "none";
      return;
    }

    studentResults.style.display = "block";

    if (!availableStudents.length) {
      studentResults.innerHTML = `<div class="student-placeholder">Loading students...</div>`;
      return;
    }

    const matches = availableStudents.filter(student => {
      const full = `${student.firstName} ${student.lastName}`.trim().toLowerCase();
      const reversed = `${student.lastName}, ${student.firstName}`.trim().toLowerCase();
      return full.includes(query) || reversed.includes(query);
    });

    if (!matches.length) {
      studentResults.innerHTML = `<div class="student-placeholder">No matches</div>`;
      return;
    }

    studentResults.innerHTML = matches
      .map(student => {
        const name = formatStudentName(student);
        const isSelected = selectedStudents.has(String(student.id));
        return `<div class="student-option ${isSelected ? "selected" : ""}" data-id="${student.id}">${name}</div>`;
      })
      .join("");
  }

  function clearLogStudentSelection() {
    selectedStudents.clear();
    if (studentHidden) studentHidden.value = "";
    if (studentChips) studentChips.innerHTML = "";
    if (studentSearchInput) studentSearchInput.value = "";
    renderLogStudentResults();
  }

  function clearLogStudentSearch() {
    if (studentSearchInput) studentSearchInput.value = "";
    clearLogStudentSelection();
    if (studentResults) studentResults.style.display = "none";
  }

  function selectLogStudent(student) {
    if (!student || !studentHidden) return;
    const key = String(student.id);
    if (selectedStudents.has(key)) return;
    selectedStudents.set(key, student);
    updateLogStudentHidden();
    renderLogStudentChips();
    if (studentSearchInput) studentSearchInput.value = "";
    renderLogStudentResults();
  }

  studentResults?.addEventListener("click", (event) => {
    const option = event.target.closest(".student-option");
    if (!option) return;
    const student = availableStudents.find(s => String(s.id) === option.dataset.id);
    if (student) selectLogStudent(student);
  });

  studentSearchInput?.addEventListener("input", () => renderLogStudentResults());
  studentSearchInput?.addEventListener("focus", () => renderLogStudentResults());

  studentChips?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("button[data-remove-student]");
    if (!removeButton) return;
    const id = removeButton.dataset.removeStudent;
    if (!id) return;
    selectedStudents.delete(id);
    updateLogStudentHidden();
    renderLogStudentChips();
    renderLogStudentResults();
  });

  clearLogStudentBtn?.addEventListener("click", clearLogStudentSearch);

  // ✅ Default date to today
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }

  // ✅ Hide student dropdown & points input for students
  if (!(activeRole === "admin" || activeRole === "teacher")) {
    if (studentRow) studentRow.style.display = "none";
    if (pointsInput) pointsInput.closest("tr").style.display = "none";
    clearLogStudentSelection();
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
  if (activeRole === "admin" || activeRole === "teacher") {
    const { data: students, error: stuErr } = await supabase
      .from("users")
      .select("id, firstName, lastName, roles, teacherIds");

    if (stuErr) {
      console.error("Supabase error loading students:", stuErr.message);
      availableStudents = [];
    } else if (students) {
      availableStudents = students
        .filter(s => {
          const roles = Array.isArray(s.roles) ? s.roles : [s.roles];
          const isStudent = roles.includes("student");

          if (activeRole === "admin") return isStudent;
          if (activeRole === "teacher") {
            const teacherList = Array.isArray(s.teacherIds) ? s.teacherIds : [];
            return isStudent && teacherList.includes(user.id);
          }
          return false;
        })
        .sort((a, b) => {
          const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
          const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });
    } else {
      availableStudents = [];
    }
    renderLogStudentResults();
  } else {
    availableStudents = [];
    renderLogStudentResults();
  }

  // ✅ Submit log
  if (submitBtn) {
    submitBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      const category = categorySelect?.value;
      const note = notesInput?.value.trim();
      const date = dateInput?.value;

      let targetUsers = [user.id];
      if (activeRole === "admin" || activeRole === "teacher") {
        targetUsers = Array.from(selectedStudents.keys());
        if (!targetUsers.length) {
          alert("Please select at least one student.");
          return;
        }
      }

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

      const inserts = targetUsers.map(id => ({
        userId: id,
        category,
        notes: note,
        date,
        points,
        status
      }));
      const { error: logErr } = await supabase.from("logs").insert(inserts);

      if (logErr) {
        console.error("Failed to save log:", logErr.message);
        alert("Error saving log.");
        return;
      }

// ✅ Recalculate user points & allow Level Up popup to trigger
for (const id of targetUsers) {
  await recalculateUserPoints(id);
}

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
          clearLogStudentSelection();
          renderLogStudentResults();

          // Reset date and hide fields if student
          if (dateInput) {
            const today = new Date().toISOString().split("T")[0];
            dateInput.value = today;
          }
          if (!(activeRole === "admin" || activeRole === "teacher")) {
            if (studentRow) studentRow.style.display = "none";
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
