const { buildSupabaseServiceClient } = require("./supabase-admin");

const NON_SEASONAL_BADGES = [
  ["practice_spark", (m) => m.practiceLogs >= 25],
  ["practice_groove", (m) => m.practiceLogs >= 100],
  ["practice_flow", (m) => m.practiceLogs >= 300],
  ["practice_mastery", (m) => m.practiceLogs >= 800],
  ["streak_spark", (m) => m.maxPracticeStreak >= 3],
  ["streak_groove", (m) => m.maxPracticeStreak >= 5],
  ["streak_rhythm", (m) => m.maxPracticeStreak >= 7],
  ["streak_momentum", (m) => m.maxPracticeStreak >= 14],
  ["streak_commitment", (m) => m.maxPracticeStreak >= 30],
  ["streak_discipline", (m) => m.maxPracticeStreak >= 100],
  ["personal_setter", (m) => m.goalsCompleted >= 1],
  ["personal_chaser", (m) => m.goalsCompleted >= 5],
  ["personal_crusher", (m) => m.goalsCompleted >= 10],
  ["personal_directed", (m) => m.goalsCompleted >= 20],
  ["participation_involved", (m) => m.participationLogs >= 1],
  ["participation_player", (m) => m.participationLogs >= 5],
  ["participation_regular", (m) => m.participationLogs >= 15],
  ["participation_citizen", (m) => m.participationLogs >= 40],
  ["proficiency_builder", (m) => (m.techniqueCompleted + m.theoryCompleted) >= 1],
  ["proficiency_focused", (m) => m.techniqueCompleted >= 3],
  ["proficiency_thinker", (m) => m.theoryCompleted >= 3],
  ["proficiency_trained", (m) => m.techniqueCompleted >= 3 && m.theoryCompleted >= 3 && m.memorizationPoints >= 300],
  ["festival_debut", (m) => m.festivalParticipations >= 1],
  ["festival_veteran", (m) => m.festivalParticipations >= 3],
  ["festival_elite", (m) => m.festivalParticipations >= 6],
  ["performance_stage", (m) => m.performanceParticipations >= 1],
  ["performance_performer", (m) => m.performanceParticipations >= 5],
  ["performance_presence", (m) => m.performanceParticipations >= 15],
  ["competition_ready", (m) => m.competitionParticipations >= 1],
  ["competition_edge", (m) => m.competitionParticipations >= 5],
  ["teacher_challenge", (m) => m.teacherChallengesCompleted >= 1],
  ["teacher_favorite", (m) => m.teacherChallengesCompleted >= 5],
  ["teacher_follower", (m) => m.teacherChallengesCompleted >= 10],
  ["memory_master", (m) => m.memorizationPoints >= 250],
  ["book_finisher", (m) => m.lessonBooksCompleted >= 3],
  ["logs_100", (m) => m.totalLogs >= 100],
  ["logs_500", (m) => m.totalLogs >= 500],
  ["logs_1000", (m) => m.totalLogs >= 1000],
  ["repair_earned", (m) => m.streakRepairUsed >= 1],
  ["repair_saved", (m) => m.streakRepairEarned > m.streakRepairUsed && (m.streakRepairEarned - m.streakRepairUsed) >= 1],
  ["repair_preserved", (m) => m.streakRepairUsed >= 1 && m.maxPracticeStreak >= 30 && m.repairProtectionSeen],
  ["member_first", (m) => m.consecutiveMembershipMonths >= 1],
  ["member_musician", (m) => m.consecutiveMembershipMonths >= 6],
  ["member_veteran", (m) => m.consecutiveMembershipMonths >= 12],
  ["member_legacy", (m) => m.consecutiveMembershipMonths >= 36],
  ["early_bird", (m) => m.hasEarlyBird],
  ["night_owl", (m) => m.hasNightOwl],
  ["comeback_kid", (m) => m.hasComebackKid],
  ["multi-tasker", (m) => m.hasMultiTasker],
  ["power_week", (m) => m.hasPowerWeek]
];

function daysBetween(a, b) {
  const one = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const two = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((two - one) / 86400000);
}

function dateToIsoDay(date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDay(value) {
  return new Date(`${value}T00:00:00Z`);
}

function toLocalHour(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false });
  return Number(fmt.format(date));
}

function getIsoWeekStart(dayStr) {
  const d = parseIsoDay(dayStr);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return dateToIsoDay(d);
}

function chunk(values, size = 250) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function seasonalWindowsForYear(year, season) {
  if (season === "summer") {
    return [{ start: `${year}-06-01`, end: `${year}-08-31` }];
  }
  return [
    { start: `${year - 1}-12-01`, end: `${year}-02-29` }
  ];
}

function isDayInRange(day, start, end) {
  return day >= start && day <= end;
}

function countQualifyingSeasonWeeks(practiceDays, season, seasonYear) {
  const windows = seasonalWindowsForYear(seasonYear, season);
  const weekCounts = new Map();

  for (const day of practiceDays) {
    const inSeason = windows.some((w) => isDayInRange(day, w.start, w.end));
    if (!inSeason) continue;
    const week = getIsoWeekStart(day);
    weekCounts.set(week, (weekCounts.get(week) || 0) + 1);
  }

  let qualifyingWeeks = 0;
  for (const count of weekCounts.values()) {
    if (count >= 2) qualifyingWeeks += 1;
  }
  return qualifyingWeeks;
}

function calcLongestConsecutiveMonthRun(periods) {
  if (!periods.length) return 0;
  const set = new Set();
  const now = new Date();
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();

  for (const p of periods) {
    const start = new Date(`${p.start_date}T00:00:00Z`);
    const end = p.end_date ? new Date(`${p.end_date}T00:00:00Z`) : now;
    let s = start.getUTCFullYear() * 12 + start.getUTCMonth();
    const e = Math.min(end.getUTCFullYear() * 12 + end.getUTCMonth(), nowMonth);
    while (s <= e) {
      set.add(s);
      s += 1;
    }
  }

  const months = Array.from(set).sort((a, b) => a - b);
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < months.length; i += 1) {
    if (months[i] === months[i - 1] + 1) {
      run += 1;
      if (run > maxRun) maxRun = run;
    } else {
      run = 1;
    }
  }
  return maxRun;
}

function createMetric() {
  return {
    totalLogs: 0,
    practiceLogs: 0,
    participationLogs: 0,
    festivalParticipations: 0,
    performanceParticipations: 0,
    competitionParticipations: 0,
    goalsCompleted: 0,
    techniqueCompleted: 0,
    theoryCompleted: 0,
    memorizationPoints: 0,
    lessonBooksCompleted: 0,
    teacherChallengesCompleted: 0,
    streakRepairEarned: 0,
    streakRepairUsed: 0,
    repairProtectionSeen: false,
    consecutiveMembershipMonths: 0,
    maxPracticeStreak: 0,
    hasEarlyBird: false,
    hasNightOwl: false,
    hasComebackKid: false,
    hasMultiTasker: false,
    hasPowerWeek: false,
    practiceDays: [],
    allLogDays: [],
    allLogCategoriesByDay: new Map()
  };
}

function normalizeRowUserId(row) {
  return String(row.user_id || row.userId || row.student_id || "");
}

async function fetchRowsInChunks(client, table, selectClause, userIdColumn, userIds, studioId, extraFilters) {
  const rows = [];
  for (const ids of chunk(userIds)) {
    let q = client.from(table).select(selectClause).eq("studio_id", studioId).in(userIdColumn, ids);
    if (typeof extraFilters === "function") {
      q = extraFilters(q);
    }
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function getTargetUsers(client, studioId, userId) {
  if (userId) return [{ user_id: userId, created_at: null }];

  const { data, error } = await client
    .from("studio_members")
    .select("user_id,roles,created_at")
    .eq("studio_id", studioId)
    .contains("roles", ["student"]);

  if (error) throw error;
  return data || [];
}

async function getStudioTimeZone(client, studioId) {
  const { data } = await client
    .from("studios")
    .select("settings")
    .eq("id", studioId)
    .single();
  const settings = data?.settings && typeof data.settings === "object" ? data.settings : {};
  return settings.timezone || settings.timeZone || "America/New_York";
}

function finalizePracticeDerivedMetrics(metric) {
  const uniquePracticeDays = Array.from(new Set(metric.practiceDays)).sort();
  metric.practiceDays = uniquePracticeDays;

  let maxStreak = 0;
  let current = 0;
  let previous = null;
  const streakSegments = [];
  let segmentStart = null;

  for (const day of uniquePracticeDays) {
    if (!previous) {
      current = 1;
      segmentStart = day;
    } else {
      const diff = daysBetween(parseIsoDay(previous), parseIsoDay(day));
      if (diff === 1) {
        current += 1;
      } else {
        streakSegments.push({ start: segmentStart, end: previous, length: current });
        current = 1;
        segmentStart = day;
      }
    }
    if (current > maxStreak) maxStreak = current;
    previous = day;
  }
  if (previous && segmentStart) {
    streakSegments.push({ start: segmentStart, end: previous, length: current });
  }
  metric.maxPracticeStreak = maxStreak;

  for (let i = 1; i < uniquePracticeDays.length; i += 1) {
    const gap = daysBetween(parseIsoDay(uniquePracticeDays[i - 1]), parseIsoDay(uniquePracticeDays[i])) - 1;
    if (gap >= 10) {
      metric.hasComebackKid = true;
      break;
    }
  }

  const streak7 = streakSegments.filter((s) => s.length >= 7);
  metric.hasPowerWeek = streak7.length >= 2;

  const dayKeys = Array.from(metric.allLogCategoriesByDay.keys()).sort();
  for (let i = 0; i < dayKeys.length; i += 1) {
    const start = parseIsoDay(dayKeys[i]);
    const end = new Date(start.toISOString());
    end.setUTCDate(end.getUTCDate() + 6);
    const categories = new Set();
    for (const d of dayKeys) {
      const parsed = parseIsoDay(d);
      if (parsed >= start && parsed <= end) {
        const set = metric.allLogCategoriesByDay.get(d);
        for (const category of set) categories.add(category);
      }
    }
    if (categories.size >= 3) {
      metric.hasMultiTasker = true;
      break;
    }
  }
}

async function persistSeasonalAwards(client, studioId, userId, seasonalSlug, seasonYears) {
  if (!seasonYears.length) return { inserted: 0, starsDelta: 0 };

  const { data: existingRows, error: existingErr } = await client
    .from("user_badge_progress")
    .select("season_year")
    .eq("studio_id", studioId)
    .eq("user_id", userId)
    .eq("badge_slug", seasonalSlug)
    .in("season_year", seasonYears);
  if (existingErr) throw existingErr;

  const existingYears = new Set((existingRows || []).map((r) => Number(r.season_year)));
  const missingYears = seasonYears.filter((y) => !existingYears.has(y));
  if (!missingYears.length) return { inserted: 0, starsDelta: 0 };

  const progressRows = missingYears.map((year) => ({
    studio_id: studioId,
    user_id: userId,
    badge_slug: seasonalSlug,
    season_year: year,
    season_key: `${seasonalSlug}:${year}`
  }));

  const { error: progressErr } = await client.from("user_badge_progress").insert(progressRows);
  if (progressErr) throw progressErr;

  const { data: existingBadge, error: badgeErr } = await client
    .from("user_badges")
    .select("id,stars,earned_at")
    .eq("user_id", userId)
    .eq("badge_slug", seasonalSlug)
    .maybeSingle();
  if (badgeErr) throw badgeErr;

  if (!existingBadge) {
    const { error: insertBadgeErr } = await client.from("user_badges").insert({
      studio_id: studioId,
      user_id: userId,
      badge_slug: seasonalSlug,
      stars: missingYears.length
    });
    if (insertBadgeErr) throw insertBadgeErr;
  } else {
    const { error: updateBadgeErr } = await client
      .from("user_badges")
      .update({
        studio_id: studioId,
        stars: Math.max(1, Number(existingBadge.stars || 1) + missingYears.length),
        last_earned_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", existingBadge.id);
    if (updateBadgeErr) throw updateBadgeErr;
  }

  return { inserted: missingYears.length, starsDelta: missingYears.length };
}

async function evaluateAndAwardBadges({ studioId, userId, client } = {}) {
  if (!studioId) throw new Error("studioId is required");
  const admin = client || buildSupabaseServiceClient();
  const timeZone = await getStudioTimeZone(admin, studioId);
  const members = await getTargetUsers(admin, studioId, userId);
  const userIds = members.map((m) => String(m.user_id)).filter(Boolean);
  if (!userIds.length) {
    return { studioId, evaluatedUsers: 0, awardedRows: 0, seasonalStarsAdded: 0 };
  }

  const metrics = new Map();
  const membershipFallback = new Map();
  for (const m of members) {
    const uid = String(m.user_id);
    metrics.set(uid, createMetric());
    membershipFallback.set(uid, m.created_at || null);
  }

  const approvedLogs = [];
  for (const ids of chunk(userIds)) {
    const { data, error } = await admin
      .from("logs")
      .select("id,userId,studio_id,category,notes,points,date,created_at,status")
      .eq("studio_id", studioId)
      .in("userId", ids)
      .eq("status", "approved");
    if (error) throw error;
    approvedLogs.push(...(data || []));
  }

  const [goalRows, testRows, bookRows, challengeRows, repairRows, membershipRows] = await Promise.all([
    fetchRowsInChunks(admin, "badge_goal_completions", "user_id,status,goal_type,completed_at", "user_id", userIds, studioId, (q) => q.eq("status", "completed")),
    fetchRowsInChunks(admin, "badge_proficiency_tests", "user_id,test_type,status,completed_at", "user_id", userIds, studioId, (q) => q.eq("status", "completed")),
    fetchRowsInChunks(admin, "badge_lesson_book_completions", "user_id,status,completed_at", "user_id", userIds, studioId, (q) => q.eq("status", "completed")),
    fetchRowsInChunks(admin, "teacher_challenge_assignments", "student_id,status,completed_at", "student_id", userIds, studioId, (q) => q.eq("status", "completed")),
    fetchRowsInChunks(admin, "badge_streak_repairs", "user_id,action,approved,protection_enabled", "user_id", userIds, studioId, (q) => q.eq("approved", true)),
    fetchRowsInChunks(admin, "badge_memberships", "user_id,start_date,end_date", "user_id", userIds, studioId)
  ]);

  for (const log of approvedLogs) {
    const uid = String(log.userId || "");
    if (!metrics.has(uid)) continue;
    const metric = metrics.get(uid);
    metric.totalLogs += 1;

    const category = String(log.category || "").trim().toLowerCase();
    const notes = String(log.notes || "");
    const day = String(log.date || "").slice(0, 10);
    if (day) {
      metric.allLogDays.push(day);
      if (!metric.allLogCategoriesByDay.has(day)) metric.allLogCategoriesByDay.set(day, new Set());
      metric.allLogCategoriesByDay.get(day).add(category || "unknown");
    }

    if (category === "practice") {
      metric.practiceLogs += 1;
      if (day) metric.practiceDays.push(day);
      if (log.created_at) {
        const hour = toLocalHour(new Date(log.created_at), timeZone);
        if (hour < 7) metric.hasEarlyBird = true;
        if (hour >= 21) metric.hasNightOwl = true;
      }
      continue;
    }

    if (category === "participation") {
      metric.participationLogs += 1;
      if (/competition/i.test(notes)) metric.competitionParticipations += 1;
    }

    if (category === "performance") {
      if (!/\[outside performance\]/i.test(notes)) {
        metric.performanceParticipations += 1;
      }
    }

    if (category === "personal") {
      metric.goalsCompleted += 1;
    }

    if (category === "proficiency") {
      if (/festival/i.test(notes)) metric.festivalParticipations += 1;
      if (/memor/i.test(notes)) metric.memorizationPoints += Number(log.points || 0);
      if (/(technique|level test)/i.test(notes)) metric.techniqueCompleted += 1;
      if (/theory/i.test(notes)) metric.theoryCompleted += 1;
      if (/book/i.test(notes) && Number(log.points || 0) >= 50) metric.lessonBooksCompleted += 1;
    }
  }

  for (const row of goalRows) {
    const uid = normalizeRowUserId(row);
    const metric = metrics.get(uid);
    if (metric) metric.goalsCompleted += 1;
  }

  for (const row of testRows) {
    const uid = normalizeRowUserId(row);
    const metric = metrics.get(uid);
    if (!metric) continue;
    if (row.test_type === "technique") metric.techniqueCompleted += 1;
    if (row.test_type === "theory") metric.theoryCompleted += 1;
  }

  for (const row of bookRows) {
    const uid = normalizeRowUserId(row);
    const metric = metrics.get(uid);
    if (metric) metric.lessonBooksCompleted += 1;
  }

  for (const row of challengeRows) {
    const uid = String(row.student_id || "");
    const metric = metrics.get(uid);
    if (metric) metric.teacherChallengesCompleted += 1;
  }

  for (const row of repairRows) {
    const uid = normalizeRowUserId(row);
    const metric = metrics.get(uid);
    if (!metric) continue;
    if (row.action === "earned") metric.streakRepairEarned += 1;
    if (row.action === "used") metric.streakRepairUsed += 1;
    if (row.protection_enabled) metric.repairProtectionSeen = true;
  }

  const membershipByUser = new Map();
  for (const row of membershipRows) {
    const uid = normalizeRowUserId(row);
    if (!membershipByUser.has(uid)) membershipByUser.set(uid, []);
    membershipByUser.get(uid).push(row);
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  let awardedRows = 0;
  let seasonalStarsAdded = 0;
  const toUpsert = [];

  for (const uid of userIds) {
    const metric = metrics.get(uid);
    const periods = membershipByUser.get(uid) || [];
    if (!periods.length && membershipFallback.get(uid)) {
      periods.push({
        start_date: String(membershipFallback.get(uid)).slice(0, 10),
        end_date: null
      });
    }

    metric.consecutiveMembershipMonths = calcLongestConsecutiveMonthRun(periods);
    finalizePracticeDerivedMetrics(metric);

    for (const [slug, qualifies] of NON_SEASONAL_BADGES) {
      if (!qualifies(metric)) continue;
      toUpsert.push({
        studio_id: studioId,
        user_id: uid,
        badge_slug: slug
      });
    }

    const winterYears = [];
    const summerYears = [];
    for (let y = currentYear - 6; y <= currentYear + 1; y += 1) {
      if (countQualifyingSeasonWeeks(metric.practiceDays, "winter", y) >= 5) winterYears.push(y);
      if (countQualifyingSeasonWeeks(metric.practiceDays, "summer", y) >= 5) summerYears.push(y);
    }

    const winterResult = await persistSeasonalAwards(admin, studioId, uid, "seasonal_winter", winterYears);
    const summerResult = await persistSeasonalAwards(admin, studioId, uid, "seasonal_summer", summerYears);
    seasonalStarsAdded += winterResult.starsDelta + summerResult.starsDelta;
    awardedRows += winterResult.inserted + summerResult.inserted;
  }

  if (toUpsert.length) {
    const { error } = await admin
      .from("user_badges")
      .upsert(toUpsert, { onConflict: "user_id,badge_slug", ignoreDuplicates: true });
    if (error) throw error;
    awardedRows += toUpsert.length;
  }

  return {
    studioId,
    evaluatedUsers: userIds.length,
    awardedRows,
    seasonalStarsAdded,
    timeZone
  };
}

module.exports = {
  evaluateAndAwardBadges
};
