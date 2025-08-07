import { supabase } from './supabase.js';

export async function recalculateUserPoints(userId) {
  try {
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

    let currentLevel = levels.find(l => totalPoints >= l.minPoints && totalPoints <= l.maxPoints) || levels[levels.length - 1];

const { error: updateError } = await supabase
  .from('users')
  .update({ points: totalPoints, level: currentLevel.id })
  .eq('id', userId);

if (updateError) {
  console.error("[ERROR] Failed to update user in recalculateUserPoints:", updateError.message);
} else {
  console.log(`[DEBUG] Successfully updated user ${userId} → ${totalPoints} pts, Level ${currentLevel.id}`);
}
    console.log(`[DEBUG] Recalculated points for user ${userId}: ${totalPoints} pts, Level ${currentLevel.id}`);
    return { totalPoints, currentLevel };
  } catch (err) {
    console.error('[ERROR] Recalculate failed:', err);
    return null;
  }
}
