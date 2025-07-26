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

    // ✅ Category change → update preview + points
    categorySelect.addEventListener("change", () => {
      const selected = categorySelect.value;
      if (previewImage) {
        previewImage.src = selected ? `images/categories/${selected.toLowerCase()}.png` : "images/categories/allCategories.png";
      }
      if (selected === "Practice") {
        pointsInput.value = 5;
        pointsInput.disabled = true;
      } else {
        pointsInput.value = "";
        pointsInput.disabled = false;
      }
    });
  }

  // ✅ Show student dropdown only for admin/teacher
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

  // ✅ Form submit → insert log into Supabase
  if (submitBtn) {
    submitBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      const category = categorySelect?.value;
      const note = notesInput?.value.trim();
      const date = dateInput?.value;
      const points = parseInt(pointsInput?.value);
      const targetUser = studentSelect && studentSelect.value ? studentSelect.value : user.id;

      if (!category || !date || isNaN(points)) {
        alert("Please fill out all required fields.");
        return;
      }

      const { error: logErr } = await supabase.from("logs").insert([{
        user: targetUser,
        category,
        note,
        date,
        points
      }]);

      if (logErr) {
        console.error("Failed to save log:", logErr.message);
        alert("Error saving log.");
      } else {
        alert("Points logged!");
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
