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

    // ✅ Filter approved logs for points/level calculation
    const approvedLogs = logs.filter(l => l.status === "approved");
    const totalPoints = approvedLogs.reduce((sum, log) => sum + (log.points || 0), 0);

    // ✅ Fetch levels
    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("*")
      .order("minPoints", { ascending: true });

    if (levelsError) throw levelsError;

    // ✅ Determine current and next level
    let currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!currentLevel && levels.length > 0) currentLevel = levels[levels.length - 1];
    const currentIndex = levels.findIndex(l => l.id === currentLevel.id);
    const nextLevel = levels[currentIndex + 1];

// ✅ Fetch latest user info, including lastName and roles
const { data: freshUser, error: userError } = await supabase
  .from("users")
  .select("id, firstName, lastName, avatarUrl, roles")
  .eq("id", storedUser.id)
  .single();

    if (userError) throw userError;

// ✅ Build user object while preserving roles if missing
const userData = {
  ...freshUser,
  lastName: freshUser?.lastName || storedUser.lastName || "",
  roles: freshUser?.roles || storedUser.roles || [],
  points: totalPoints,
  level: currentLevel?.id || 1,
  badge: currentLevel?.badge || `images/levelBadges/level${currentLevel?.id || 1}.png`,
  levelColor: currentLevel?.color || "#3eb7f8"
};

    // ✅ Update local storage
    localStorage.setItem("loggedInUser", JSON.stringify(userData));

    // ✅ Update UI with all dynamic features
    updateHomeUI(userData, activeRole, currentLevel, nextLevel);

  } catch (err) {
    console.error("[ERROR] Could not refresh home page info:", err);
    updateHomeUI(storedUser, activeRole, null, null);
  }
});

function updateHomeUI(userData, activeRole, currentLevel, nextLevel) {
  // ✅ Welcome Title
  const welcome = document.getElementById("welcomeTitle");
  if (welcome) {
    welcome.textContent = `Welcome, ${userData.firstName}!`;
    welcome.style.color = "#00477d";
    welcome.style.fontSize = "2rem";
    welcome.style.fontWeight = "bold";
  }

  // ✅ Avatar
  const avatar = document.getElementById("homeAvatar");
  if (avatar) avatar.src = userData.avatarUrl || "images/logos/default.png";

  // ✅ Badge
  const badgeImg = document.getElementById("homeBadge");
  if (badgeImg) {
    badgeImg.src = (activeRole === "student")
      ? userData.badge
      : `images/levelBadges/${activeRole}.png`;
  }

  // ✅ Progress Bar (Dynamic % & Color)
const progressBar = document.getElementById("homeProgressBar");
const progressLabel = document.getElementById("homeProgressLabel");
  const levelTitle = document.querySelector("#progressCard h3");

  if (levelTitle) levelTitle.style.color = "white";

if (progressBar && progressLabel && currentLevel) {
  let percent = 100;
  if (nextLevel) {
    percent = ((userData.points - currentLevel.minPoints) /
      (nextLevel.minPoints - currentLevel.minPoints)) * 100;
  }
  percent = Math.min(100, Math.max(0, percent));

  progressBar.style.width = percent + "%";
  progressBar.style.backgroundColor = userData.levelColor;
  progressLabel.textContent = `${Math.round(percent)}% to next level`;
}

  // ✅ Role-based UI visibility
  const myPointsBtn = document.getElementById("myPointsBtn");
  const reviewLogsBtn = document.getElementById("reviewLogsBtn");
  const manageUsersBtn = document.getElementById("manageUsersBtn");
  const levelSection = document.getElementById("levelSection");
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
    levelSection.style.display = "block";
    topRow.classList.add("flex-center");
  }
}
