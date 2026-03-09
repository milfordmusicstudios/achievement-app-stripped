import { supabase } from "./supabaseClient.js";

export function showToast(message, type = "success", duration = 2200) {
  if (typeof document === "undefined") return;

  let host = document.getElementById("appToastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "appToastHost";
    host.style.cssText = [
      "position: fixed",
      "top: 16px",
      "right: 16px",
      "display: flex",
      "flex-direction: column",
      "gap: 8px",
      "z-index: 1000000",
      "pointer-events: none",
      "max-width: min(92vw, 360px)"
    ].join("; ");
    document.body.appendChild(host);
  }

  const toast = document.createElement("div");
  const typeStyles = {
    success: "background:#e8f8ee; border-color:#1f7a3e; color:#114d28;",
    error: "background:#fdecec; border-color:#b42318; color:#7a271a;",
    info: "background:#eaf3ff; border-color:#1d4ed8; color:#1e3a8a;"
  };

  toast.style.cssText = [
    "pointer-events: auto",
    "border: 1px solid",
    "border-radius: 10px",
    "padding: 10px 12px",
    "font-size: 14px",
    "font-weight: 600",
    "box-shadow: 0 8px 24px rgba(0,0,0,0.18)",
    "transform: translateY(-6px)",
    "opacity: 0",
    "transition: opacity 140ms ease, transform 140ms ease",
    typeStyles[type] || typeStyles.info
  ].join("; ");

  toast.textContent = message;
  host.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 160);
  }, Math.max(900, duration));
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
        showToast(`${fullName} reached ${currentLevel.name || `Level ${currentLevel.id}`}.`, 'success', 2600);
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
