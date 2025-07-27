import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const storedUser = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!storedUser || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // ✅ Clear badge temporarily to avoid showing outdated level
  const badgeImg = document.getElementById("homeBadge");
  if (badgeImg) badgeImg.src = "images/levelBadges/loading.png";

  try {
    // ✅ Always fetch latest user data
    const { data: freshUser, error } = await supabase
      .from("users")
      .select("id, firstName, level, points, avatarUrl, badge")
      .eq("id", storedUser.id)
      .single();

    if (error) throw error;

    // ✅ Update local storage with latest data
    localStorage.setItem("loggedInUser", JSON.stringify(freshUser));

    // ✅ Render UI with fresh data
    updateHomeUI(freshUser, activeRole);
    console.log("[DEBUG] User level refreshed:", freshUser.level);

  } catch (err) {
    console.error("[ERROR] Could not fetch updated user:", err);
    // fallback to existing data
    updateHomeUI(storedUser, activeRole);
  }
});

function updateHomeUI(userData, activeRole) {
  // ✅ Welcome message
  const welcome = document.getElementById("welcomeTitle");
  if (welcome) {
    welcome.textContent = `Welcome, ${userData.firstName}!`;
    welcome.style.color = "#00477d";
  }

  // ✅ Avatar
  const avatar = document.getElementById("homeAvatar");
  if (avatar) avatar.src = userData.avatarUrl || "images/logos/default.png";

  // ✅ Badge (always use latest userData)
  const badgeImg = document.getElementById("homeBadge");
  if (badgeImg) {
    if (activeRole === "student") {
      badgeImg.src = userData.badge || `images/levelBadges/level${userData.level || 1}.png`;
    } else {
      badgeImg.src = `images/levelBadges/${activeRole}.png`;
    }
  }
  // ✅ Manage layout & role-based UI
  const myPointsBtn = document.getElementById("myPointsBtn");
  const reviewLogsBtn = document.getElementById("reviewLogsBtn");
  const manageUsersBtn = document.getElementById("manageUsersBtn");
  const levelSelection = document.getElementById("levelSection");
  const middleCol = document.getElementById("middleButtonCol");
  const topRow = middleCol?.parentElement;

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
    if (activeRole === "admin") manageUsersBtn.style.display = "inline-block";
  } else {
    myPointsBtn.classList.remove("invisible");
    myPointsBtn.style.display = "flex";
    middleCol.style.display = "flex";
    levelSelection.style.display = "block";
    topRow.classList.add("flex-center");
  }
}
