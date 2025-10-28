import { supabase } from './supabase.js';

// ✅ Helper: Popup for level-up event
function showLevelUpPopup(userName, newLevelName) {
  console.log("[DEBUG] Showing Level-Up popup for:", userName, newLevelName);

  const overlay = document.createElement('div');
  overlay.style = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex; justify-content: center; align-items: center;
    z-index: 99999; /* ensure top layer */
  `;

  overlay.innerHTML = `
    <div style="
      background: white;
      padding: 30px;
      border-radius: 14px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      max-width: 340px;
    ">
      <h2 style="color:#00477d; margin-bottom:10px;">🎉 Level Up!</h2>
      <p>${userName} just reached <b>${newLevelName}</b>!</p>
      <button id="closeLevelUpPopup" class="blue-button" style="margin-top:15px;">OK</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Attach close button
  const closeBtn = document.getElementById('closeLevelUpPopup');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => overlay.remove());
  } else {
    console.warn("[WARN] closeLevelUpPopup button not found!");
  }
}

export async function recalculateUserPoints(userId) {
  try {
    console.log("[DEBUG] Starting point recalculation for user:", userId);

    // 🔹 1. Get previous user data
    const { data: userBefore, error: beforeErr } = await supabase
      .from('users')
      .select('points, level, firstName, lastName')
      .eq('id', userId)
      .single();

    if (beforeErr) throw beforeErr;
    console.log("[DEBUG] Previous user level:", userBefore?.level);

    // 🔹 2. Get approved logs
    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('*')
      .eq('userId', userId)
      .eq('status', 'approved');

    if (logsError) throw logsError;

    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);

    // 🔹 3. Get levels
    const { data: levels, error: levelsError } = await supabase
      .from('levels')
      .select('*')
      .order('minPoints', { ascending: true });

    if (levelsError) throw levelsError;

    const currentLevel =
      levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) ||
      levels[levels.length - 1];

    // 🔹 4. Update user record
    const { error: updateError } = await supabase
      .from('users')
      .update({ points: totalPoints, level: currentLevel.id })
      .eq('id', userId);

    if (updateError) throw updateError;
console.log("[DEBUG] userBefore.level:", userBefore.level);
console.log("[DEBUG] currentLevel.id:", currentLevel.id);
console.log("[DEBUG] totalPoints:", totalPoints);

// 🔹 5. Detect level up reliably using localStorage
let previousLevel = userBefore?.level;

// If this user is logged in locally, use stored level to compare
const loggedIn = JSON.parse(localStorage.getItem('loggedInUser'));
if (loggedIn && loggedIn.id === userId && loggedIn.level) {
  previousLevel = loggedIn.level;
}

console.log("[DEBUG] previousLevel:", previousLevel, "currentLevel.id:", currentLevel.id);

if (previousLevel !== currentLevel.id) {
  const fullName = `${userBefore.firstName || ''} ${userBefore.lastName || ''}`.trim();
  console.log(`[DEBUG] LEVEL UP detected for ${fullName}`);

  // ✅ Insert admin notification
  const { error: notifErr } = await supabase.from('notifications').insert([
    {
      userId,
      message: `${fullName} advanced to Level ${currentLevel.name || currentLevel.id}!`
    }
  ]);
  if (notifErr) console.error("[ERROR] Notification insert failed:", notifErr.message);

  // ✅ Show popup if this user is logged in
  if (loggedIn && loggedIn.id === userId) {
    setTimeout(() => {
      showLevelUpPopup(fullName, currentLevel.name || `Level ${currentLevel.id}`);
    }, 500);
  }

  // ✅ Update localStorage so it doesn't repeat next time
  loggedIn.level = currentLevel.id;
  localStorage.setItem('loggedInUser', JSON.stringify(loggedIn));

} else {
      console.log("[DEBUG] No level change detected.");
    }

    console.log(`[DEBUG] Updated ${userId}: ${totalPoints} pts, Level ${currentLevel.id}`);
    return { totalPoints, currentLevel };

  } catch (err) {
    console.error('[ERROR] Recalculate failed:', err);
    return null;
  }
}
