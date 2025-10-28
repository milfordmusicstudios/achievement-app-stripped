import { supabase } from './supabase.js';

// ✅ Helper: Popup for level-up event
function showLevelUpPopup(userName, newLevelName) {
  console.log("[DEBUG] Showing Level-Up popup for:", userName, newLevelName);

  setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.style = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex; justify-content: center; align-items: center;
      z-index: 999999;
    `;

    overlay.innerHTML = `
      <div style="
        background: white;
        padding: 30px;
        border-radius: 14px;
        text-align: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        max-width: 340px;
        animation: fadeIn 0.3s ease;
      ">
        <h2 style="color:#00477d; margin-bottom:10px;">🎉 Level Up!</h2>
        <p>${userName} just reached <b>${newLevelName}</b>!</p>
        <button id="closeLevelUpPopup" class="blue-button" style="margin-top:15px;">OK</button>
      </div>
    `;

    document.body.appendChild(overlay);
    const closeBtn = document.getElementById('closeLevelUpPopup');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  }, 1500);
}

export async function recalculateUserPoints(userId) {
  try {
    const { data: userBefore, error: beforeErr } = await supabase
      .from('users')
      .select('points, level, firstName, lastName, roles')
      .eq('id', userId)
      .single();
    if (beforeErr) throw beforeErr;

    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('*')
      .eq('userId', userId)
      .eq('status', 'approved');
    if (logsError) throw logsError;

    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);

    const { data: levels, error: levelsError } = await supabase
      .from('levels')
      .select('*')
      .order('minPoints', { ascending: true });
    if (levelsError) throw levelsError;

    const currentLevel =
      levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) ||
      levels[levels.length - 1];

    const { error: updateError } = await supabase
      .from('users')
      .update({ points: totalPoints, level: currentLevel.id })
      .eq('id', userId);
    if (updateError) throw updateError;

    const loggedIn = JSON.parse(localStorage.getItem('loggedInUser'));
    let previousLevel = userBefore?.level;
    if (loggedIn && loggedIn.id === userId && loggedIn.level) {
      previousLevel = loggedIn.level;
    }

    if (previousLevel !== currentLevel.id) {
      const fullName = `${userBefore.firstName || ''} ${userBefore.lastName || ''}`.trim();

      await supabase.from('notifications').insert([
        {
          userId,
          message: `${fullName} advanced to Level ${currentLevel.name || currentLevel.id}!`,
        },
      ]);

      if (loggedIn && loggedIn.id === userId && loggedIn.roles?.includes('student')) {
        showLevelUpPopup(fullName, currentLevel.name || `Level ${currentLevel.id}`);
        loggedIn.level = currentLevel.id;
        localStorage.setItem('loggedInUser', JSON.stringify(loggedIn));
      }
    }

    console.log(`[DEBUG] Updated ${userId}: ${totalPoints} pts, Level ${currentLevel.id}`);
    return { totalPoints, currentLevel };
  } catch (err) {
    console.error('[ERROR] Recalculate failed:', err);
    return null;
  }
}
