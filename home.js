import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const storedUser = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");

  if (!storedUser || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  try {
    // ✅ Fetch logs for current user
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", storedUser.id);

    if (logsError) throw logsError;

    // ✅ Filter approved logs for level/points calculation
    const approvedLogs = logs.filter(l => l.status === "approved");
    const totalPoints = approvedLogs.reduce((sum, log) => sum + (log.points || 0), 0);

    // ✅ Fetch levels and calculate current level dynamically
    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("*")
      .order("minPoints", { ascending: true });

    if (levelsError) throw levelsError;

    let currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!currentLevel && levels.length > 0) currentLevel = levels[levels.length - 1];

    // ✅ Fetch latest user info (avatar, name)
    const { data: freshUser, error: userError } = await supabase
      .from("users")
      .select("id, firstName, avatarUrl")
      .eq("id", storedUser.id)
      .single();

    if (userError) throw userError;

    // ✅ Construct refreshed user data
    const userData = {
      ...freshUser,
      points: totalPoints,
      level: currentLevel?.id || 1,
      badge: currentLevel?.badge || `images/levelBadges/level${currentLevel?.id || 1}.png`
    };

    // ✅ Update local storage with recalculated values
    localStorage.setItem("loggedInUser", JSON.stringify(userData));

    // ✅ Update UI
    updateHomeUI(userData, activeRole);

  } catch (err) {
    console.error("[ERROR] Could not refresh user info:", err);
    // Fallback to stored user if fetch fails
    updateHomeUI(storedUser, activeRole);
  }
});

function updateHomeUI(userData, activeRole) {
  // ✅ Welcome text
  const welcome = document.getElementById("welcomeTitle");
  if (welcome) {
    welcome.textContent = `Welcome, ${userData.firstName}!`;
    welcome.style.color = "#00477d";
  }

  // ✅ Avatar
  const avatar = document.getElementById("homeAvatar");
  if (avatar) avatar.src = userData.avatarUrl || "images/logos/default.png";

  // ✅ Badge
  const badgeImg = document.getElementById("homeBadge");
  if (badgeImg) {
    if (activeRole === "student") {
      badgeImg.src = userData.badge;
    } else {
      badgeImg.src = `images/levelBadges/${activeRole}.png`;
    }
  }

  // ✅ Role-based UI
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
