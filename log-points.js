
import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const categorySelect = document.getElementById("logCategory");
const previewImage = document.getElementById("previewImage");
  const pointsInput = document.getElementById("logPoints");
  const notesInput = document.getElementById("logNotes");
  const dateInput = document.getElementById("logDate");
  const studentSelect = document.getElementById("studentSelector");
  const studentRow = document.getElementById("studentRow");
  const submitBtn = document.querySelector("button[type='submit']");
  const cancelBtn = document.querySelector("button[type='button']");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const role = localStorage.getItem("activeRole");

  if (!user || !role) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // Show default category preview
  previewImage.src = "images/categories/allCategories.png";

  // Load categories
  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("*")
    .order("id", { ascending: true });

  if (catErr || !categories) {
    console.error("Failed to load categories:", catErr?.message);
    return;
  }

  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.name;
    opt.textContent = cat.name;
    categorySelect.appendChild(opt);
  });

  categorySelect.addEventListener("change", () => {
    const selected = categorySelect.value.toLowerCase();
    previewImage.src = selected ? `images/categories/${selected}.png` : "images/categories/allCategories.png";

    if (selected === "practice") {
      pointsInput.value = 5;
      pointsInput.disabled = true;
    } else {
      pointsInput.value = "";
      pointsInput.placeholder = "Points will be assigned by your teacher";
      pointsInput.disabled = false;
    }
  });

  // Show student selector only for admin or teacher
  if (role === "admin" || role === "teacher") {
    studentRow.style.display = "table-row";

    let studentFilter = supabase.from("users").select("id, firstName, lastName").contains("roles", ["student"]);

    if (role === "teacher") {
      studentFilter = studentFilter.contains("teachers", [user.id]);
    }

    const { data: students, error: stuErr } = await studentFilter;

    if (stuErr) {
      console.error("Failed to load students:", stuErr.message);
    } else {
      studentSelect.innerHTML = "<option value=''>-- Select Student --</option>";
      students.forEach(stu => {
        const opt = document.createElement("option");
        opt.value = stu.id;
        opt.textContent = stu.firstName + " " + stu.lastName;
        studentSelect.appendChild(opt);
      });
    }
  } else {
    studentRow.style.display = "none";
  }

  // Submit
  submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const category = categorySelect.value;
    const note = notesInput.value.trim();
    const date = dateInput.value;
    const points = parseInt(pointsInput.value);
    const targetUser = studentSelect && studentSelect.value ? studentSelect.value : user.id;

    if (!category || !date || isNaN(points)) {
      alert("Please fill out all required fields.");
      return;
    }

    const { error: logError } = await supabase.from("logs").insert([{
      user: targetUser,
      category,
      note,
      date,
      points
    }]);

    if (logError) {
      console.error("Failed to log points:", logError.message);
      alert("Log failed.");
    } else {
      alert("Points logged!");
      window.location.href = "index.html";
    }
  });

  cancelBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
