
import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const categorySelect = document.getElementById("logCategory");
  const previewImage = document.getElementById("categoryPreview");
  const pointsInput = document.getElementById("logPoints");
  const notesInput = document.getElementById("logNotes");
  const dateInput = document.getElementById("logDate");
  const submitBtn = document.querySelector("button[type='submit']");
  const cancelBtn = document.querySelector("button[type='button']");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // Show default image
  previewImage.src = "images/categories/allCategories.png";

  // Load categories from Supabase
  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .order("id", { ascending: true });

  if (error || !categories) {
    console.error("Unable to load categories:", error.message);
    alert("Unable to load categories.");
    return;
  }

  // Populate dropdown
  categorySelect.innerHTML = "<option value=''>Choose a category...</option>";
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.name;
    opt.textContent = cat.name;
    categorySelect.appendChild(opt);
  });

  // Change preview and point behavior on selection
  categorySelect.addEventListener("change", () => {
    const selected = categorySelect.value;
    const fileName = selected.toLowerCase() + ".png";
    previewImage.src = `images/categories/${fileName}`;

    if (selected === "Practice") {
      pointsInput.value = 5;
      pointsInput.disabled = true;
    } else {
      pointsInput.value = "";
      pointsInput.placeholder = "Points will be assigned by your teacher";
      pointsInput.disabled = false;
    }
  });

  // Submit log
  submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const category = categorySelect.value;
    const note = notesInput.value.trim();
    const date = dateInput.value;
    const points = parseInt(pointsInput.value);

    if (!category || !date || (isNaN(points) && category === "Practice")) {
      alert("Please fill out all required fields.");
      return;
    }

    const { error: logError } = await supabase.from("logs").insert([{
      user: user.id,
      category,
      note,
      date,
      points
    }]);

    if (logError) {
      console.error("Log save failed:", logError.message);
      alert("Failed to save log.");
    } else {
      alert("Points logged!");
      window.location.href = "index.html";
    }
  });

  // Cancel button
  cancelBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
