import { supabase } from './supabase.js';

// ✅ Helper: Popup for level-up event
function showLevelUpPopup(userName, newLevelName) {
  const popup = document.createElement('div');
  popup.style = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000;
  `;
  popup.innerHTML = `
    <div style="background:white; padding:30px; border-radius:12px; text-align:center; max-width:320px; box-shadow:0 2px 10px rgba(0,0,0,0.3);">
      <h3 style="color:#00477d; margin-bottom:15px;">🎉 Level Up!</h3>
      <p>${userName} just reached <b>${newLevelName}</b>!</p>
      <button id="closeLevelUpPopup" class="blue-button" style="margin-top:15px;">OK</button>
    </div>
  `;
  document.body.appendChild(popup);
  document.getElementById('closeLevelUpPopup').addEventListener('click', () => {
    popup.remove();
  });
}

export async function recalculateUserPoints(userId) {
  try {
    // 🔹 1. Get previous user data
    const { data: userBefore } = await supabase
      .from('users')
      .select('points, level, firstName, lastName')
      .eq('id', userId)
      .single();

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

    // 🔹 5. Detect level up
    if (userBefore && userBefore.level !== currentLevel.id) {
      const fullName = `${userBefore.firstName || ''} ${userBefore.lastName || ''}`.trim();

      // ✅ Insert admin notification
      await supabase.from('notifications').insert([
        {
          userId,
          message: `${fullName} advanced to Level ${currentLevel.name || currentLevel.id}!`
        }
      ]);

      // ✅ Show popup if this user is logged in
      const loggedIn = JSON.parse(localStorage.getItem('loggedInUser'));
      if (loggedIn && loggedIn.id === userId) {
        showLevelUpPopup(fullName, currentLevel.name || `Level ${currentLevel.id}`);
      }
    }

    console.log(
      `[DEBUG] Updated ${userId}: ${totalPoints} pts, Level ${currentLevel.id}`
    );
    return { totalPoints, currentLevel };
  } catch (err) {
    console.error('[ERROR] Recalculate failed:', err);
    return null;
  }
}
