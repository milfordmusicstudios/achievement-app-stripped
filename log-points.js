import { supabase } from './supabase.js';
import { recalculateUserPoints } from './utils.js';

// === DOM elements ===
const form = document.getElementById("logForm");
const categorySelect = document.getElementById("categorySelect");
const pointsInput = document.getElementById("pointsInput");
const noteInput = document.getElementById("noteInput");
const studentSelect = document.getElementById("studentSelect");
const popupContainer = document.getElementById("popupContainer");

const loggedIn = JSON.parse(localStorage.getItem("loggedInUser"));

// === Category Descriptions ===
const categoryDescriptions = {
  "practice": "Daily practice logs for instrument or voice. Worth 5 points.",
  "participation": "Points for group class or studio involvement.",
  "performance": "Points for recitals, gigs, or public shows.",
  "personal": "Achievements or milestones in personal progress.",
  "proficiency": "Demonstrating specific skill mastery or testing."
};

categorySelect.addEventListener("change", () => {
  const selected = categorySelect.value.toLowerCase();
  const descBox = document.getElementById("categoryDescription");
  if (descBox) descBox.textContent = categoryDescriptions[selected] || "";
});

// === Popup for Submission ===
function showPopup(message) {
  const overlay = document.createElement("div");
  overlay.style = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6);
    display: flex; justify-content: center; align-items: center;
    z-index: 9999;
  `;

  overlay.innerHTML = `
    <div style="
      background: white;
      padding: 30px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      max-width: 300px;
    ">
      <p>${message}</p>
      <button id="closePopup" class="blue-button" style="margin-top:10px;">OK</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById("closePopup").addEventListener("click", () => {
    overlay.remove();
  });
}

// === Load Students for Admin/Teacher ===
async function loadStudents() {
  if (!loggedIn) return;

  // Only admins or teachers see this list
  const roles = loggedIn.roles || [];
  if (!roles.includes("admin") && !roles.includes("teacher")) {
    if (studentSelect) studentSelect.parentElement.style.display = "none";
    return;
  }

  const { data: students, error } = await supabase
    .from("users")
    .select("id, firstName, lastName, roles")
    .order("lastName", { ascending: true });

  if (error) {
    console.error("Error loading students:", error.message);
    return;
  }

  const eligible = students.filter(u => u.roles?.includes("student"));
  studentSelect.innerHTML = `<option value="">Select a Student</option>`;
  eligible.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.firstName || ""} ${s.lastName || ""}`;
    studentSelect.appendChild(opt);
  });
}

// === Form Submission ===
form.addEventListener("submit", async e => {
  e.preventDefault();

  if (!loggedIn) {
    alert("You must be logged in to log points.");
    return;
  }

  const category = categorySelect.value;
  const points = parseInt(pointsInput.value);
  const note = noteInput.value.trim();

  // determine target user
  let targetUserId = loggedIn.id;
  const roles = loggedIn.roles || [];

  if ((roles.includes("admin") || roles.includes("teacher")) && studentSelect?.value) {
    targetUserId = studentSelect.value;
  }

  if (!category || !points) {
    alert("Please fill in all required fields.");
    return;
  }

  const { error } = await supabase.from("logs").insert([
    {
      userId: targetUserId,
      category,
      points,
      note,
      status: roles.includes("student") ? "pending" : "approved",
      date: new Date().toISOString(),
    }
  ]);

  if (error) {
    alert("Error logging points: " + error.message);
    return;
  }

  showPopup("Log submitted successfully!");
  form.reset();
  const descBox = document.getElementById("categoryDescription");
  if (descBox) descBox.textContent = "";

  // Recalculate points & check for level up
  await recalculateUserPoints(targetUserId);
});

// === Initialize ===
loadStudents();
