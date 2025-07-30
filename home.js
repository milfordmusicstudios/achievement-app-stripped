import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const storedUser = JSON.parse(localStorage.getItem("loggedInUser"));
  const activeRole = localStorage.getItem("activeRole");
  const isParent = JSON.parse(localStorage.getItem("isParent") || "false");
  console.log("DEBUG isParent flag:", isParent);

  if (!storedUser || !activeRole) {
    alert("You must be logged in.");
    window.location.href = "login.html";
    return;
  }

  // ✅ Show modal for parent OR teacher/admin with children
  if (isParent || (storedUser.roles && storedUser.roles.includes("teacher"))) {
    console.log("DEBUG: Parent/Teacher detected, fetching children...");
    const { data: children, error } = await supabase
      .from('users')
      .select('id, firstName, lastName, email, roles, avatarUrl')
      .eq('parent_uuid', storedUser.id);

    console.log("DEBUG: Children fetched:", children, error);

    if (!error && children && children.length > 0) {
      children.forEach(c => {
        if (typeof c.roles === "string") {
          try { c.roles = JSON.parse(c.roles); }
          catch { c.roles = c.roles.split(",").map(r => r.trim()); }
        } else if (!Array.isArray(c.roles)) {
          c.roles = c.roles ? [c.roles] : [];
        }
      });

      const onlyChildren = children.filter(c => !c.roles.includes("parent"));
      if (onlyChildren.length > 1) {
        showChildModal(onlyChildren, storedUser);
        return;
      } else if (onlyChildren.length === 1) {
        setActiveChild(onlyChildren[0], storedUser);
        return;
      }
    }
  }

  try {
    const { data: logs, error: logsError } = await supabase
      .from("logs")
      .select("*")
      .eq("userId", storedUser.id);
    if (logsError) throw logsError;

    const approvedLogs = logs.filter(l => l.status === "approved");
    const totalPoints = approvedLogs.reduce((sum, log) => sum + (log.points || 0), 0);

    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("*")
      .order("minPoints", { ascending: true });
    if (levelsError) throw levelsError;

    let currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints);
    if (!currentLevel && levels.length > 0) currentLevel = levels[levels.length - 1];
    const currentIndex = levels.findIndex(l => l.id === currentLevel.id);
    const nextLevel = levels[currentIndex + 1];

    const { data: freshUser, error: userError } = await supabase
      .from("users")
      .select("id, firstName, lastName, avatarUrl, roles")
      .eq("id", storedUser.id)
      .single();
    if (userError) throw userError;

    const userData = {
      ...freshUser,
      lastName: freshUser?.lastName || storedUser.lastName || "",
      roles: freshUser?.roles || storedUser.roles || [],
      points: totalPoints,
      level: currentLevel?.id || 1,
      badge: currentLevel?.badge || `images/levelBadges/level${currentLevel?.id || 1}.png`,
      levelColor: currentLevel?.color || "#3eb7f8"
    };

    localStorage.setItem("loggedInUser", JSON.stringify(userData));
    updateHomeUI(userData, activeRole, currentLevel, nextLevel);

  } catch (err) {
    console.error("[ERROR] Could not refresh home page info:", err);
    updateHomeUI(storedUser, activeRole, null, null);
  }
});

function showChildModal(children, parent) {
  parent._children = children;
  const modal = document.getElementById("childSelectModal");
  const container = document.getElementById("childButtons");
  container.innerHTML = '';

  // ✅ Add teacher/admin parent as an option
  const parentBtn = document.createElement("button");
  parentBtn.textContent = `${parent.firstName} ${parent.lastName} (${parent.roles.join(", ")})`;
  parentBtn.className = "blue-button";
  parentBtn.onclick = () => setActiveChild(parent, parent);
  container.appendChild(parentBtn);

  // ✅ Add children
  children.forEach(child => {
    const btn = document.createElement("button");
    btn.textContent = `${child.firstName} ${child.lastName}`;
    btn.className = "blue-button";
    btn.onclick = () => setActiveChild(child, parent);
    container.appendChild(btn);
  });

  modal.style.display = "flex";
}

function setActiveChild(child, parent) {
  if (!child.id) {
    console.error("ERROR: Child object missing ID", child);
    return;
  }
  child.id = String(child.id);

  console.log("DEBUG: Switching to child", child);

  localStorage.setItem("loggedInUser", JSON.stringify(child));
  const defaultRole = Array.isArray(child.roles) ? child.roles[0] : "student";
  localStorage.setItem("activeRole", defaultRole);
  localStorage.setItem("loggedInParent", JSON.stringify(parent));
  localStorage.setItem('isParent', false);

  document.getElementById("childSelectModal").style.display = "none";
  location.reload();
}

function cancelChildSelection() {
  localStorage.clear();
  window.location.href = "login.html";
}

function updateHomeUI(userData, activeRole, currentLevel, nextLevel) {
  const welcome = document.getElementById("welcomeTitle");
  if (welcome) {
    welcome.textContent = `Welcome, ${userData.firstName}!`;
    welcome.style.color = "#00477d";
    welcome.style.fontSize = "2rem";
    welcome.style.fontWeight = "bold";
  }

  const avatar = document.getElementById("homeAvatar");
  if (avatar) avatar.src = userData.avatarUrl || "images/logos/default.png";

  const badgeImg = document.getElementById("homeBadge");
  if (badgeImg) {
    badgeImg.src = (activeRole === "student")
      ? userData.badge
      : `images/levelBadges/${activeRole}.png`;
  }

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
