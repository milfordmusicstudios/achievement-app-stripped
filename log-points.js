
import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const categorySelect = document.getElementById("category");
  const notesInput = document.getElementById("notes");
  const dateInput = document.getElementById("date");
  const pointsInput = document.getElementById("points");
  const previewImage = document.getElementById("categoryPreview");
  const submitBtn = document.getElementById("submitBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) {
    alert("You must be logged in to log points.");
    window.location.href = "login.html";
    return;
  }

  // Default category preview
  previewImage.src = "images/categories/allCategories.png";

  categorySelect.addEventListener("change", () => {
    const selected = categorySelect.value;
    if (!selected) {
      previewImage.src = "images/categories/allCategories.png";
      pointsInput.value = "";
      pointsInput.disabled = false;
      return;
    }

    previewImage.src = `images/categories/${selected.toLowerCase()}.png`;

    if (selected === "Practice") {
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
      alert("Failed to save log. Please try again.");
    } else {
      alert("Points logged!");
      window.location.href = "index.html";
    }
  });

  cancelBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
