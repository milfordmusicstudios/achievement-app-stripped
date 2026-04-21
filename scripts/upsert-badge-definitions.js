require('dotenv').config({ path: '.env.local' });

const { createClient } = require("@supabase/supabase-js");

const BADGES = [
  { slug: "practice_spark", name: "Practice Spark", family: "practice", tier: 1, sort_order: 101, criteria: { type: "practice_logs", min: 25 } },
  { slug: "practice_groove", name: "Practice Groove", family: "practice", tier: 2, sort_order: 102, criteria: { type: "practice_logs", min: 100 } },
  { slug: "practice_flow", name: "Practice Flow", family: "practice", tier: 3, sort_order: 103, criteria: { type: "practice_logs", min: 300 } },
  { slug: "practice_mastery", name: "Practice Mastery", family: "practice", tier: 4, sort_order: 104, criteria: { type: "practice_logs", min: 800 } },

  { slug: "streak_spark", name: "3-Day Spark", family: "practice_streak", tier: 1, sort_order: 201, criteria: { type: "practice_streak_days", min: 3 } },
  { slug: "streak_groove", name: "5-Day Groove", family: "practice_streak", tier: 2, sort_order: 202, criteria: { type: "practice_streak_days", min: 5 } },
  { slug: "streak_rhythm", name: "7-Day Rhythm", family: "practice_streak", tier: 3, sort_order: 203, criteria: { type: "practice_streak_days", min: 7 } },
  { slug: "streak_momentum", name: "14-Day Momentum", family: "practice_streak", tier: 4, sort_order: 204, criteria: { type: "practice_streak_days", min: 14 } },
  { slug: "streak_commitment", name: "30-Day Commitment", family: "practice_streak", tier: 5, sort_order: 205, criteria: { type: "practice_streak_days", min: 30 } },
  { slug: "streak_discipline", name: "100-Day Discipline", family: "practice_streak", tier: 6, sort_order: 206, criteria: { type: "practice_streak_days", min: 100 } },

  { slug: "personal_setter", name: "Goal Setter", family: "personal_goals", tier: 1, sort_order: 301, criteria: { type: "goals_completed", min: 1 } },
  { slug: "personal_chaser", name: "Goal Chaser", family: "personal_goals", tier: 2, sort_order: 302, criteria: { type: "goals_completed", min: 5 } },
  { slug: "personal_crusher", name: "Goal Crusher", family: "personal_goals", tier: 3, sort_order: 303, criteria: { type: "goals_completed", min: 10 } },
  { slug: "personal_directed", name: "Goal Directed", family: "personal_goals", tier: 4, sort_order: 304, criteria: { type: "goals_completed", min: 20 } },

  { slug: "participation_involved", name: "Getting Involved", family: "participation", tier: 1, sort_order: 401, criteria: { type: "participation_logs", min: 1 } },
  { slug: "participation_player", name: "Group Player", family: "participation", tier: 2, sort_order: 402, criteria: { type: "participation_logs", min: 5 } },
  { slug: "participation_regular", name: "Community Regular", family: "participation", tier: 3, sort_order: 403, criteria: { type: "participation_logs", min: 15 } },
  { slug: "participation_citizen", name: "Studio Citizen", family: "participation", tier: 4, sort_order: 404, criteria: { type: "participation_logs", min: 40 } },

  { slug: "proficiency_builder", name: "Skill Builder", family: "proficiency", tier: 1, sort_order: 501, criteria: { type: "technique_or_theory_completed", min: 1 } },
  { slug: "proficiency_focused", name: "Technique Focused", family: "proficiency", tier: 2, sort_order: 502, criteria: { type: "technique_completed", min: 3 } },
  { slug: "proficiency_thinker", name: "Theory Thinker", family: "proficiency", tier: 3, sort_order: 503, criteria: { type: "theory_completed", min: 3 } },
  { slug: "proficiency_trained", name: "Well-Trained Musician", family: "proficiency", tier: 4, sort_order: 504, criteria: { type: "combined", requires: [{ metric: "technique_completed", min: 3 }, { metric: "theory_completed", min: 3 }, { metric: "memorization_points", min: 300 }] } },

  { slug: "festival_debut", name: "Festival Debut", family: "festival", tier: 1, sort_order: 601, criteria: { type: "festival_participation", min: 1 } },
  { slug: "festival_veteran", name: "Festival Veteran", family: "festival", tier: 2, sort_order: 602, criteria: { type: "festival_participation", min: 3 } },
  { slug: "festival_elite", name: "Festival Elite", family: "festival", tier: 3, sort_order: 603, criteria: { type: "festival_participation", min: 6 } },

  { slug: "performance_stage", name: "On the Stage", family: "performance", tier: 1, sort_order: 701, criteria: { type: "performance_participation", min: 1 } },
  { slug: "performance_performer", name: "Seasoned Performer", family: "performance", tier: 2, sort_order: 702, criteria: { type: "performance_participation", min: 5 } },
  { slug: "performance_presence", name: "Stage Presence", family: "performance", tier: 3, sort_order: 703, criteria: { type: "performance_participation", min: 15 } },

  { slug: "competition_ready", name: "Competition Ready", family: "competition", tier: 1, sort_order: 801, criteria: { type: "competition_participation", min: 1 } },
  { slug: "competition_edge", name: "Competitive Edge", family: "competition", tier: 2, sort_order: 802, criteria: { type: "competition_participation", min: 5 } },

  { slug: "teacher_challenge", name: "Teacher's Challenge", family: "teacher_guided", tier: 1, sort_order: 901, criteria: { type: "teacher_challenges_completed", min: 1 } },
  { slug: "teacher_favorite", name: "Coach's Favorite", family: "teacher_guided", tier: 2, sort_order: 902, criteria: { type: "teacher_challenges_completed", min: 5 } },
  { slug: "teacher_follower", name: "Instruction Follower", family: "teacher_guided", tier: 3, sort_order: 903, criteria: { type: "teacher_challenges_completed", min: 10 } },

  { slug: "memory_master", name: "Memory Master", family: "memory_completion", tier: 1, sort_order: 1001, criteria: { type: "memorization_points", min: 250 } },
  { slug: "book_finisher", name: "Book Finisher", family: "memory_completion", tier: 2, sort_order: 1002, criteria: { type: "lesson_books_completed", min: 3 } },

  { slug: "logs_100", name: "100 Logs", family: "log_milestones", tier: 1, sort_order: 1101, criteria: { type: "total_logs", min: 100 } },
  { slug: "logs_500", name: "500 Logs", family: "log_milestones", tier: 2, sort_order: 1102, criteria: { type: "total_logs", min: 500 } },
  { slug: "logs_1000", name: "1,000 Logs", family: "log_milestones", tier: 3, sort_order: 1103, criteria: { type: "total_logs", min: 1000 } },

  { slug: "repair_earned", name: "Streak Repair Earned", family: "streak_repair", tier: 1, sort_order: 1201, criteria: { type: "streak_repairs_used", min: 1 } },
  { slug: "repair_saved", name: "Streak Repair Stored", family: "streak_repair", tier: 2, sort_order: 1202, criteria: { type: "streak_repair_tokens_unused", min: 1 } },
  { slug: "repair_preserved", name: "Streak Preserved", family: "streak_repair", tier: 3, sort_order: 1203, criteria: { type: "repair_preserved_combo" } },

  { slug: "member_first", name: "First Month Member", family: "longevity", tier: 1, sort_order: 1301, criteria: { type: "consecutive_membership_months", min: 1 } },
  { slug: "member_musician", name: "6-Month Musician", family: "longevity", tier: 2, sort_order: 1302, criteria: { type: "consecutive_membership_months", min: 6 } },
  { slug: "member_veteran", name: "1-Year Studio Veteran", family: "longevity", tier: 3, sort_order: 1303, criteria: { type: "consecutive_membership_months", min: 12 } },
  { slug: "member_legacy", name: "3-Year Legacy Member", family: "longevity", tier: 4, sort_order: 1304, criteria: { type: "consecutive_membership_months", min: 36 } },

  { slug: "early_bird", name: "Early Bird", family: "fun", tier: 1, sort_order: 1401, criteria: { type: "practice_log_before_hour", hour: 7 } },
  { slug: "night_owl", name: "Night Owl", family: "fun", tier: 2, sort_order: 1402, criteria: { type: "practice_log_after_hour", hour: 21 } },
  { slug: "comeback_kid", name: "Comeback Kid", family: "fun", tier: 3, sort_order: 1403, criteria: { type: "practice_gap_return", min_gap_days: 10 } },
  { slug: "multi-tasker", name: "Multi-Tasker", family: "fun", tier: 4, sort_order: 1404, criteria: { type: "distinct_categories_rolling_days", categories_min: 3, window_days: 7 } },
  { slug: "power_week", name: "Power Week", family: "fun", tier: 5, sort_order: 1405, criteria: { type: "streak_restart_after_rhythm" } },

  { slug: "seasonal_winter", name: "Winter Consistency", family: "seasonal", tier: 1, sort_order: 1501, is_seasonal: true, criteria: { type: "seasonal_weeks", season: "winter", min_weeks: 5, min_days_per_week: 2 } },
  { slug: "seasonal_summer", name: "Summer Consistency", family: "seasonal", tier: 2, sort_order: 1502, is_seasonal: true, criteria: { type: "seasonal_weeks", season: "summer", min_weeks: 5, min_days_per_week: 2 } }
];

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const now = new Date().toISOString();
  const payload = BADGES.map((badge) => ({
    ...badge,
    is_seasonal: Boolean(badge.is_seasonal),
    is_active: true,
    updated_at: now
  }));

  const { error } = await admin.from("badge_definitions").upsert(payload, { onConflict: "slug" });
  if (error) {
    throw error;
  }

  console.log(`Upserted ${payload.length} badge definitions.`);
}

main().catch((err) => {
  console.error("Failed to upsert badge definitions:", err.message || err);
  process.exit(1);
});
