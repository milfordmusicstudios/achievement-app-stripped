
import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const categorySelect = document.getElementById("category");
  const previewImage = document.getElementById("categoryPreview");
  const pointsInput = document.getElementById("points");
  const notesInput = document.getElementById("notes");
  const dateInput = document.getElementById("date");
  const submitBtn = document.getElementById("submitBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // Show default image first
  previewImage.src = "images/categories/allCategories.png";

  // Load categories from Supabase
  const { data: categories, error } = await supabase.from("categories").select("*").order("id", { ascending: true });

  if (error || !categories) {
    alert("Unable to load categories.");
    return;
  }

  // Populate dropdown
  categorySelect.innerHTML = "<option value=''>-- Select Category --</option>";
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.name;
    opt.dataset.icon = cat.icon;
    opt.textContent = cat.name;
    categorySelect.appendChild(opt);
  });

  // Update preview and point behavior on change
  categorySelect.addEventListener("change", () => {
    const selectedOption = categorySelect.selectedOptions[0];
    const iconPath = selectedOption?.dataset.icon;

    if (!selectedOption.value) {
      previewImage.src = "images/categories/allCategories.png";
      pointsInput.value = "";
      pointsInput.disabled = false;
      return;
    }

    previewImage.src = iconPath || "images/categories/allCategories.png";

    if (selectedOption.value === "Practice") {
      pointsInput.value = 5;
      pointsInput.disabled = true;
    } else {
      pointsInput.value = "";
      pointsInput.disabled = false;
      alert("Points will be assigned by your teacher.");
    }
  });

  submitBtn.addEventListener("click", async () => {
    const category = categorySelect.value;
    const note = notesInput.value.trim();
    const date = dateInput.value;
    const points = parseInt(pointsInput.value);

    if (!category || !date || (isNaN(points) && category === "Practice")) {
      alert("Please fill out all required fields.");
      return;
    }

    const { error } = await supabase.from("logs").insert([
      {
        user: user.id,
        category,
        note,
        date,
        points
      }
    ]);

    if (error) {
      console.error("Error saving log:", error.message);
      alert("Failed to save log.");
    } else {
      alert("Points logged!");
      window.location.href = "index.html";
    }
  });

  cancelBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
