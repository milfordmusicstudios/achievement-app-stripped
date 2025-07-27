import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!user || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  console.log("[DEBUG] Loading home page for user:", user.id);

  try {
    // ✅ Fetch latest user data from Supabase
    const { data: freshUser, error } = await supabase
      .from("users")
      .select("id, firstName, level, points, avatarUrl, badge")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    // ✅ Update localStorage with fresh user data
    localStorage.setItem("loggedInUser", JSON.stringify(freshUser));

    // ✅ Apply refreshed data
    updateHomeUI(freshUser, activeRole);

  } catch (err) {
    console.error("[ERROR] Could not refresh user info:", err);
    // fallback to localStorage data if fetch fails
    updateHomeUI(user, activeRole);
  }
});

function updateHomeUI(userData, activeRole) {
  // ✅ Welcome message
  const welcome = document.getElementById("welcomeTitle");
  welcome.textContent = `Welcome, ${userData.firstName}!`;
  welcome.style.color = "#00477d";
  welcome.style.fontSize = "2em";
  welcome.style.fontWeight = "bold";

  // ✅ Avatar
  const avatar = document.getElementById("homeAvatar");
  avatar.src = userData.avatarUrl?.trim() || "images/logos/default.png";

  // ✅ Badge
  const badgeImg = document.getElementById("homeBadge");
  if (activeRole === "student") {
    const levelNumber = userData.level || 1;
    badgeImg.src = userData.badge || `images/levelBadges/level${levelNumber}.png`;
  } else {
    badgeImg.src = `images/levelBadges/${activeRole}.png`;
    document.getElementById("progressSection")?.classList.add("hidden");
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
