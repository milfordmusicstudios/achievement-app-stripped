
import { supabase } from './supabase.js';

const user = JSON.parse(localStorage.getItem("loggedInUser"));
const activeRole = localStorage.getItem("activeRole") || "student";

const categories = [
  "Practice",
  "Participation",
  "Performance",
  "Improvement",
  "Teamwork"
];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { data: users, error: usersError } = await supabase.from("users").select("*");
    if (usersError) throw usersError;

    const studentSelector = document.getElementById("logStudent");
    const logForm = document.getElementById("logForm");
    const studentRow = document.getElementById("studentSelectGroup");
    const categorySelect = document.getElementById("logCategory");

    if (categorySelect && categorySelect.children.length <= 1) {
      categories.forEach(cat => {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
      });
    }

    if (activeRole === "admin" || activeRole === "teacher") {
      const filtered = users.filter(u => {
        const roleList = Array.isArray(u.roles || u.role) ? u.roles || u.role : [u.roles || u.role];
        const isStudent = roleList.includes("student");
        const teaches = Array.isArray(u.teacher)
          ? u.teacher.includes(user.id)
          : u.teacher === user.id;
        return isStudent && (activeRole === "admin" || teaches);
      });

      filtered.sort((a, b) => a.lastName.localeCompare(b.lastName));

      filtered.forEach(s => {
        const option = document.createElement("option");
        option.value = s.id;
        option.textContent = `${s.firstName} ${s.lastName}`;
        studentSelector.appendChild(option);
      });

      studentRow.style.display = "table-row";
    } else {
      studentRow.style.display = "none";
    }

    logForm.addEventListener("submit", async e => {
      e.preventDefault();
      const formData = new FormData(logForm);

      const log = {
        user: activeRole === "student" ? user.id : formData.get("student"),
        date: new Date().toISOString().split("T")[0],
        category: formData.get("category"),
        points: parseInt(formData.get("points")),
        note: formData.get("note") || ""
      };

      const { error: insertError } = await supabase.from("logs").insert([log]);
      if (insertError) {
        console.error("Failed to insert log:", insertError);
        alert("Error saving log.");
        return;
      }

      alert("Points logged!");
      logForm.reset();
      if (studentSelector) studentSelector.selectedIndex = 0;
    });

  } catch (err) {
    console.error("Error loading page:", err);
    alert("Failed to load data.");
  }
});
