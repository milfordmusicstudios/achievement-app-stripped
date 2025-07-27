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

  // ✅ Load categories from Supabase
  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("*")
    .order("id", { ascending: true });

  if (!catErr && categories && categorySelect) {
    categorySelect.innerHTML = "<option value=''>Category</option>";
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.dataset.icon = cat.icon;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });

    // ✅ Category change → update preview and points
    categorySelect.addEventListener("change", () => {
      const selected = categorySelect.value;
      if (previewImage) {
        previewImage.src = selected ? `images/categories/${selected.toLowerCase()}.png` : "images/categories/allCategories.png";
      }
      // ✅ Auto-assign 5 points for Practice
      if (selected === "Practice") {
        if (pointsInput) pointsInput.value = 5;
      } else if (pointsInput && (activeRole === "admin" || activeRole === "teacher")) {
        pointsInput.value = "";
      }
    });
  }

  // ✅ Populate student list only for teachers/admins
  if ((activeRole === "admin" || activeRole === "teacher") && studentSelect) {
    const { data: students, error: stuErr } = await supabase
      .from("users")
      .select("id, firstName, lastName, roles, teachers");

    if (!stuErr && students) {
      const filtered = students.filter(s => {
        const roles = Array.isArray(s.roles) ? s.roles : [s.roles];
        const isStudent = roles.includes("student");
        if (activeRole === "admin") return isStudent;
        if (activeRole === "teacher") return isStudent && s.teachers?.includes(user.id);
      });

      studentSelect.innerHTML = "<option value=''>Select a student</option>";
      filtered.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.firstName} ${s.lastName}`;
        studentSelect.appendChild(opt);
      });
    }
  }

  // ✅ Submit form → save log
  if (submitBtn) {
submitBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  const category = categorySelect?.value;
  const note = notesInput?.value.trim();
  const date = dateInput?.value;

  // ✅ If user is student, auto-assign their ID
  const targetUser = (activeRole === "admin" || activeRole === "teacher") && studentSelect.value
    ? studentSelect.value
    : user.id;

  // ✅ Points logic
  let points = null;
  if (category === "Practice") {
    points = 5; // ✅ Always assign 5 for Practice
  } else if (activeRole === "admin" || activeRole === "teacher") {
    // ✅ Teachers/Admins may input points, but it's optional
    const enteredPoints = parseInt(pointsInput?.value);
    if (!isNaN(enteredPoints)) points = enteredPoints;
  }

  // ✅ Validation: Category & Date must be filled, but points is not required for students
  if (!category || !date) {
    alert("Please complete category and date.");
    return;
  }

  const { error: logErr } = await supabase.from("logs").insert([{
    userId: targetUser,
    category,
    notes: note,
    date,
    points,           // ✅ Can be null for non-practice logs
    status: "pending" // ✅ Always pending initially
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

  // ✅ Cancel button → back to home
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
});
