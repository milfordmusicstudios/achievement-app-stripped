import { supabase } from './supabase.js';

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
        alert("✅ Log submitted successfully!");
        window.location.href = "index.html";
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
