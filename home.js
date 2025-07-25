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
const welcome = document.getElementById("welcomeTitle");
welcome.textContent = `Welcome, ${user.firstName}!`;
welcome.style.color = "#00477d";

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

    document.getElementById("homeProgressBar").style.width = "75%"; // Placeholder
    document.getElementById("homeProgressBar").style.backgroundColor = "#007bff";
    document.getElementById("homeProgressText").textContent = `75% to next level`;
  } else {
    badgeImg.src = `images/levelBadges/${activeRole}.png`;
    document.getElementById("progressSection")?.classList.add("hidden");
  }

  // ✅ Manage layout and visibility
  const myPointsBtn = document.getElementById("myPointsBtn");
  const reviewLogsBtn = document.getElementById("reviewLogsBtn");
  const manageUsersBtn = document.getElementById("manageUsersBtn");
  const levelSelection = document.getElementById("levelSection");
  const middleCol = document.getElementById("middleButtonCol");
  const topRow = middleCol?.parentElement;

  // Reset all states
  myPointsBtn.classList.add("invisible");
  reviewLogsBtn.classList.add("invisible");
  myPointsBtn.style.display = "none";
  reviewLogsBtn.style.display = "none";
  middleCol.style.display = "none";
  topRow.classList.remove("flex-center");

  if (activeRole === "admin" || activeRole === "teacher") {
    reviewLogsBtn.classList.remove("invisible");
    reviewLogsBtn.style.display = "flex";
    middleCol.style.display = "flex";
    topRow.classList.add("flex-center");

    if (activeRole === "admin") {
      manageUsersBtn.style.display = "inline-block";
    }
  } else {
    myPointsBtn.classList.remove("invisible");
    myPointsBtn.style.display = "flex";
    middleCol.style.display = "flex";
    levelSelection.style.display = "block";
    topRow.classList.add("flex-center");
  }
});
