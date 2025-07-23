import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;

  if (!userId) {
    window.location.href = "login.html";
    return;
  }

  // Load user profile
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    console.error("Error loading user:", userError);
    window.location.href = "login.html";
    return;
  }

  // Save locally
  localStorage.setItem("loggedInUser", JSON.stringify(user));

  // Role fallback logic
  let activeRole = localStorage.getItem("activeRole");
  if (!activeRole) {
    const roles = user.roles || ['student'];
    activeRole = roles.includes("admin") ? "admin"
                : roles.includes("teacher") ? "teacher"
                : "student";
    localStorage.setItem("activeRole", activeRole);
  }

  document.getElementById('welcomeTitle').textContent = `Welcome ${user.firstName}!`;

  // Avatar
  const avatarImg = document.getElementById('homeavatar');
  avatarImg.src = user.avatar
    ? `images/avatars/${user.avatar}`
    : `images/avatars/default.png`;

  // Badge & Level
const badgeImg = document.getElementById("homeBadge");
const role = localStorage.getItem("activeRole");

if (role === "student") {
  const levelNumber = user.level || 1;
  badgeImg.src = `images/levelBadges/level${levelNumber}.png`;
} else if (role === "admin") {
  badgeImg.src = "images/levelBadges/admin.png";
} else if (role === "teacher") {
  badgeImg.src = "images/levelBadges/teacher.png";
}
badgeImg.alt = `${role} badge`;
  const progressBar = document.getElementById('homeProgressBar');
  const progressText = document.getElementById('homeProgressText');

  if (activeRole === "admin") {
    badge.src = "images/levelBadges/admin.png";
    progressBar.style.display = "none";
    progressText.style.display = "none";
  } else if (activeRole === "teacher") {
    badge.src = "images/levelBadges/teacher.png";
    progressBar.style.display = "none";
    progressText.style.display = "none";
  } else {
    badge.src = `images/levelBadges/level${user.level || 1}.png`;
    progressBar.style.width = "75%"; // Placeholder until logs are wired up
    progressBar.style.backgroundColor = "#007bff";
    progressText.textContent = `75% to next level`; // Placeholder
  }
});
