import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  console.log("User loaded:", user);
  console.log("User roles:", user.roles);
  console.log("Active role:", activeRole);

  document.body.classList.add(`${activeRole}-mode`);

  // ✅ Set avatar with fallback
  const avatar = document.getElementById("homeAvatar");
  if (avatar) {
    const avatarURL = user.avatar && user.avatar.trim() !== ""
      ? user.avatar
      : "images/logos/default.png";
    avatar.src = avatarURL;
  }

  // ✅ Set badge
  const badgeImg = document.getElementById("homeBadge");

  if (activeRole === "student") {
    const levelNumber = user.level || 1;
    badgeImg.src = `images/levelBadges/level${levelNumber}.png`;

    // ✅ Set progress bar for students
    document.getElementById("homeProgressBar").style.width = "75%"; // Placeholder
    document.getElementById("homeProgressBar").style.backgroundColor = "#007bff";
    document.getElementById("homeProgressText").textContent = `75% to next level`;

  } else {
    // ✅ Teacher or Admin badge
    badgeImg.src = `images/levelBadges/${activeRole}.png`;

    // ✅ Hide progress bar and label
    document.getElementById("progressSection")?.classList.add("hidden");
  }

  // ✅ Show buttons based on role
const myPointsBtn = document.getElementById("myPointsBtn");
const reviewLogsBtn = document.getElementById("reviewLogsBtn");
const manageUsersBtn = document.getElementById("manageUsersBtn");
const levelSelection = document.getElementById("levelSection");

// Always show both buttons, but only one should be visible
myPointsBtn.style.visibility = "visible";
reviewLogsBtn.style.visibility = "visible";

myPointsBtn.classList.remove("invisible");
reviewLogsBtn.classList.remove("invisible");
myPointsBtn.style.display = "flex";
reviewLogsBtn.style.display = "flex";

// Hide one with visibility
if (activeRole === "admin" || activeRole === "teacher") {
  myPointsBtn.classList.add("invisible");
  reviewLogsBtn.classList.remove("invisible");
middleCol.style.display = "flex"; // Hide the middle column
} else if (activeRole === "student") {
  myPointsBtn.classList.remove("invisible");
  reviewLogsBtn.classList.add("invisible");
  middleCol.style.display = "flex"; // Show the middle column
}  if (activeRole === "admin") {
    manageUsersBtn.style.display = "inline-block";
  }
 else {
  reviewLogsBtn.classList.add("invisible");
  myPointsBtn.classList.remove("invisible");
  levelSelection.style.display = "block";
}
  });
