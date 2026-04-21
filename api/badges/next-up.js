const { createClient } = require("@supabase/supabase-js");
const { buildSupabaseServiceClient } = require("../_lib/badges/supabase-admin");

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function parseCookies(req) {
  const raw = String(req.headers?.cookie || "");
  if (!raw) return {};
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function looksLikeJwt(value) {
  const token = String(value || "").trim();
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every(Boolean);
}

function getAccessToken(req) {
  const authHeader = String(req.headers?.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (looksLikeJwt(bearer)) return bearer;
  }

  const cookies = parseCookies(req);
  for (const [key, value] of Object.entries(cookies)) {
    if (looksLikeJwt(value)) return value;
    if (!key.includes("auth-token")) continue;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && looksLikeJwt(parsed[0])) return parsed[0];
      if (looksLikeJwt(parsed?.access_token)) return parsed.access_token;
      if (looksLikeJwt(parsed?.currentSession?.access_token)) return parsed.currentSession.access_token;
    } catch {
      // Ignore invalid cookie JSON.
    }
  }
  return "";
}

function parseRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((r) => String(r || "").toLowerCase());
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((r) => String(r || "").toLowerCase());
    } catch {
      return raw.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [String(raw || "").toLowerCase()];
}

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

function seasonalWindowsForYear(year, season) {
  if (season === "summer") {
    return [{ start: `${year}-06-01`, end: `${year}-08-31` }];
  }
  return [{ start: `${year - 1}-12-01`, end: `${year}-02-29` }];
}

function isDayInRange(day, start, end) {
  return day >= start && day <= end;
}

function countQualifyingSeasonWeeks(practiceDays, season, seasonYear, minDaysPerWeek = 2) {
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
    if (count >= minDaysPerWeek) qualifyingWeeks += 1;
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
    allLogCategoriesByDay: new Map()
  };
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

function normalizePercent(current, required) {
  const req = Math.max(1, Number(required || 0));
  const cur = Math.max(0, Number(current || 0));
  return Math.max(0, Math.min(100, Math.round((cur / req) * 100)));
}

function metricValueByName(metric, name) {
  switch (name) {
    case "practice_logs": return metric.practiceLogs;
    case "practice_streak_days": return metric.maxPracticeStreak;
    case "goals_completed": return metric.goalsCompleted;
    case "participation_logs": return metric.participationLogs;
    case "technique_or_theory_completed": return metric.techniqueCompleted + metric.theoryCompleted;
    case "technique_completed": return metric.techniqueCompleted;
    case "theory_completed": return metric.theoryCompleted;
    case "festival_participation": return metric.festivalParticipations;
    case "performance_participation": return metric.performanceParticipations;
    case "competition_participation": return metric.competitionParticipations;
    case "teacher_challenges_completed": return metric.teacherChallengesCompleted;
    case "memorization_points": return metric.memorizationPoints;
    case "lesson_books_completed": return metric.lessonBooksCompleted;
    case "total_logs": return metric.totalLogs;
    case "streak_repairs_used": return metric.streakRepairUsed;
    case "streak_repair_tokens_unused": return Math.max(0, metric.streakRepairEarned - metric.streakRepairUsed);
    case "consecutive_membership_months": return metric.consecutiveMembershipMonths;
    default: return 0;
  }
}

function requirementLabel(definition, criteria) {
  if (definition?.name) return String(definition.name);
  if (criteria?.type) return String(criteria.type);
  return String(definition?.slug || "Badge");
}

function formatCriteriaDescription(criteria) {
  if (!criteria || typeof criteria !== "object") {
    return "Complete the required activity to earn this badge.";
  }
  const type = String(criteria.type || "").toLowerCase();
  const byType = {
    practice_logs: `Log at least ${Number(criteria.min || 0)} practice entries.`,
    practice_streak_days: `Reach a ${Number(criteria.min || 0)}-day practice streak.`,
    goals_completed: `Complete at least ${Number(criteria.min || 0)} goals.`,
    participation_logs: `Log at least ${Number(criteria.min || 0)} participation entries.`,
    technique_or_theory_completed: `Complete at least ${Number(criteria.min || 0)} technique or theory test(s).`,
    technique_completed: `Complete at least ${Number(criteria.min || 0)} technique tests.`,
    theory_completed: `Complete at least ${Number(criteria.min || 0)} theory tests.`,
    festival_participation: `Participate in at least ${Number(criteria.min || 0)} festival event(s).`,
    performance_participation: `Participate in at least ${Number(criteria.min || 0)} performance event(s).`,
    competition_participation: `Participate in at least ${Number(criteria.min || 0)} competition event(s).`,
    teacher_challenges_completed: `Complete at least ${Number(criteria.min || 0)} teacher challenge(s).`,
    memorization_points: `Earn at least ${Number(criteria.min || 0)} memorization points.`,
    lesson_books_completed: `Complete at least ${Number(criteria.min || 0)} lesson books.`,
    total_logs: `Submit at least ${Number(criteria.min || 0)} total logs.`,
    streak_repairs_used: `Use streak repair at least ${Number(criteria.min || 0)} time(s).`,
    streak_repair_tokens_unused: `Keep at least ${Number(criteria.min || 0)} streak repair token(s) unused.`,
    consecutive_membership_months: `Maintain membership for ${Number(criteria.min || 0)} consecutive month(s).`,
    practice_log_before_hour: `Log practice before ${Number(criteria.hour || 0)}:00.`,
    practice_log_after_hour: `Log practice after ${Number(criteria.hour || 0)}:00.`,
    practice_gap_return: `Return to practice after a ${Number(criteria.min_gap_days || 0)}+ day gap.`,
    distinct_categories_rolling_days: `Log ${Number(criteria.categories_min || 0)}+ categories within ${Number(criteria.window_days || 0)} days.`,
    seasonal_weeks: `During ${String(criteria.season || "").toLowerCase() || "the season"}, complete ${Number(criteria.min_weeks || 0)} weeks with ${Number(criteria.min_days_per_week || 0)}+ practice days each week.`,
    repair_preserved_combo: "Use streak repair and preserve your long streak progress.",
    streak_restart_after_rhythm: "Restart and rebuild your streak after reaching rhythm-level consistency."
  };
  if (byType[type]) return byType[type];
  if (Array.isArray(criteria.requires) && criteria.requires.length) {
    const parts = criteria.requires.map((req) => `${String(req.metric || "").replace(/_/g, " ")}: ${Number(req.min || 0)}+`);
    return `Meet all requirements: ${parts.join(", ")}.`;
  }
  return "Complete the required activity to earn this badge.";
}

function getProgressForDefinition(definition, metric) {
  const criteria = definition?.criteria && typeof definition.criteria === "object" ? definition.criteria : {};
  const type = String(criteria.type || "").trim().toLowerCase();

  if (!type) {
    return { current: 0, required: 1, percent: 0, label: requirementLabel(definition, criteria) };
  }

  if (type === "combined") {
    const requires = Array.isArray(criteria.requires) ? criteria.requires : [];
    if (!requires.length) {
      return { current: 0, required: 1, percent: 0, label: requirementLabel(definition, criteria) };
    }
    let current = 0;
    let required = 0;
    for (const req of requires) {
      const metricName = String(req?.metric || "").trim().toLowerCase();
      const min = Math.max(1, Number(req?.min || 1));
      const value = Math.max(0, Number(metricValueByName(metric, metricName) || 0));
      current += Math.min(value, min);
      required += min;
    }
    return {
      current,
      required,
      percent: normalizePercent(current, required),
      label: requirementLabel(definition, criteria)
    };
  }

  if (type === "practice_log_before_hour") {
    const current = metric.hasEarlyBird ? 1 : 0;
    return { current, required: 1, percent: current ? 100 : 0, label: requirementLabel(definition, criteria) };
  }
  if (type === "practice_log_after_hour") {
    const current = metric.hasNightOwl ? 1 : 0;
    return { current, required: 1, percent: current ? 100 : 0, label: requirementLabel(definition, criteria) };
  }
  if (type === "practice_gap_return") {
    const current = metric.hasComebackKid ? 1 : 0;
    return { current, required: 1, percent: current ? 100 : 0, label: requirementLabel(definition, criteria) };
  }
  if (type === "distinct_categories_rolling_days") {
    const current = metric.hasMultiTasker ? 1 : 0;
    return { current, required: 1, percent: current ? 100 : 0, label: requirementLabel(definition, criteria) };
  }
  if (type === "streak_restart_after_rhythm") {
    const current = metric.hasPowerWeek ? 1 : 0;
    return { current, required: 1, percent: current ? 100 : 0, label: requirementLabel(definition, criteria) };
  }
  if (type === "repair_preserved_combo") {
    const current = metric.streakRepairUsed >= 1 && metric.maxPracticeStreak >= 30 && metric.repairProtectionSeen ? 1 : 0;
    return { current, required: 1, percent: current ? 100 : 0, label: requirementLabel(definition, criteria) };
  }
  if (type === "seasonal_weeks") {
    const minWeeks = Math.max(1, Number(criteria.min_weeks || 1));
    const minDaysPerWeek = Math.max(1, Number(criteria.min_days_per_week || 2));
    const season = String(criteria.season || "winter").toLowerCase();
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    let maxWeeks = 0;
    for (let y = currentYear - 6; y <= currentYear + 1; y += 1) {
      const weeks = countQualifyingSeasonWeeks(metric.practiceDays, season, y, minDaysPerWeek);
      if (weeks > maxWeeks) maxWeeks = weeks;
    }
    return {
      current: Math.min(maxWeeks, minWeeks),
      required: minWeeks,
      percent: normalizePercent(maxWeeks, minWeeks),
      label: requirementLabel(definition, criteria)
    };
  }

  const min = Math.max(1, Number(criteria.min || 1));
  const value = Math.max(0, Number(metricValueByName(metric, type) || 0));
  return {
    current: Math.min(value, min),
    required: min,
    percent: normalizePercent(value, min),
    label: requirementLabel(definition, criteria)
  };
}

async function getStudioTimeZone(admin, studioId) {
  const { data } = await admin
    .from("studios")
    .select("settings")
    .eq("id", studioId)
    .single();
  const settings = data?.settings && typeof data.settings === "object" ? data.settings : {};
  return settings.timezone || settings.timeZone || "America/New_York";
}

async function buildUserMetrics(admin, studioId, userId) {
  const timeZone = await getStudioTimeZone(admin, studioId);
  const metric = createMetric();

  const [
    logsResult,
    goalsResult,
    testsResult,
    booksResult,
    challengesResult,
    repairsResult,
    membershipsResult
  ] = await Promise.all([
    admin
      .from("logs")
      .select("category,notes,points,date,created_at,status")
      .eq("studio_id", studioId)
      .eq("userId", userId)
      .eq("status", "approved"),
    admin
      .from("badge_goal_completions")
      .select("status")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .eq("status", "completed"),
    admin
      .from("badge_proficiency_tests")
      .select("test_type,status")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .eq("status", "completed"),
    admin
      .from("badge_lesson_book_completions")
      .select("status")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .eq("status", "completed"),
    admin
      .from("teacher_challenge_assignments")
      .select("status")
      .eq("studio_id", studioId)
      .eq("student_id", userId)
      .eq("status", "completed"),
    admin
      .from("badge_streak_repairs")
      .select("action,approved,protection_enabled")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .eq("approved", true),
    admin
      .from("badge_memberships")
      .select("start_date,end_date")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
  ]);

  for (const result of [logsResult, goalsResult, testsResult, booksResult, challengesResult, repairsResult, membershipsResult]) {
    if (result.error) throw result.error;
  }

  const approvedLogs = logsResult.data || [];
  for (const log of approvedLogs) {
    metric.totalLogs += 1;
    const category = String(log.category || "").trim().toLowerCase();
    const notes = String(log.notes || "");
    const day = String(log.date || "").slice(0, 10);
    if (day) {
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
      if (!/\[outside performance\]/i.test(notes)) metric.performanceParticipations += 1;
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

  metric.goalsCompleted += (goalsResult.data || []).length;
  for (const row of testsResult.data || []) {
    if (row.test_type === "technique") metric.techniqueCompleted += 1;
    if (row.test_type === "theory") metric.theoryCompleted += 1;
  }
  metric.lessonBooksCompleted += (booksResult.data || []).length;
  metric.teacherChallengesCompleted += (challengesResult.data || []).length;
  for (const row of repairsResult.data || []) {
    if (row.action === "earned") metric.streakRepairEarned += 1;
    if (row.action === "used") metric.streakRepairUsed += 1;
    if (row.protection_enabled) metric.repairProtectionSeen = true;
  }
  metric.consecutiveMembershipMonths = calcLongestConsecutiveMonthRun(membershipsResult.data || []);
  finalizePracticeDerivedMetrics(metric);

  return metric;
}

module.exports = async (req, res) => {
  console.log('[next-up] method=', req.method, 'query=', req.query, 'body=', req.body);

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    console.error("[Badges][NextUp] method not allowed", {
      method: req.method,
      url: req.url || ""
    });
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.method === "GET"
    ? (req.query && typeof req.query === "object" ? req.query : {})
    : parseBody(req);
  const studioId = String(body.studioId || body.studio_id || "").trim();
  const requestedUserId = String(body.userId || body.user_id || "").trim();
  console.log("[Badges][NextUp] request", {
    method: req.method,
    url: req.url || "",
    studioId,
    requestedUserId
  });
  if (!studioId) {
    return res.status(400).json({ ok: false, error: "Missing studioId" });
  }

  const url = process.env.SUPABASE_URL;
  const authKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !authKey) {
    return res.status(500).json({ ok: false, error: "Missing Supabase configuration" });
  }

  const token = getAccessToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const authClient = createClient(url, authKey, { auth: { persistSession: false } });
    const {
      data: { user },
      error: userErr
    } = await authClient.auth.getUser(token);
    if (userErr || !user?.id) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const callerId = String(user.id);
    const targetUserId = requestedUserId || callerId;
    const admin = buildSupabaseServiceClient();

    const { data: callerMembership, error: callerMembershipErr } = await admin
      .from("studio_members")
      .select("roles")
      .eq("studio_id", studioId)
      .eq("user_id", callerId)
      .maybeSingle();
    if (callerMembershipErr) throw callerMembershipErr;
    if (!callerMembership) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const callerRoles = parseRoles(callerMembership.roles);
    const callerIsStaff = callerRoles.includes("admin") || callerRoles.includes("teacher");
    const targetStudentId = targetUserId;

    const { data: targetStudent, error: targetStudentErr } = await admin
      .from("users")
      .select("id, parent_uuid, studio_id")
      .eq("id", targetStudentId)
      .maybeSingle();
    if (targetStudentErr) throw targetStudentErr;
    if (!targetStudent) {
      return res.status(404).json({ ok: false, error: "Student not found" });
    }

    if (String(targetStudent.studio_id) !== String(studioId)) {
      return res.status(404).json({ ok: false, error: "Student is not in this studio" });
    }

    if (
      !callerIsStaff &&
      String(targetStudentId) !== String(callerId) &&
      String(targetStudent.parent_uuid || "") !== String(callerId)
    ) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const [defsResult, earnedResult, metric] = await Promise.all([
      admin
        .from("badge_definitions")
        .select("slug,name,family,tier,criteria,is_active")
        .eq("is_active", true),
      admin
        .from("user_badges")
        .select("badge_slug")
        .eq("studio_id", studioId)
        .eq("user_id", targetStudentId),
      buildUserMetrics(admin, studioId, targetStudentId)
    ]);

    if (defsResult.error) throw defsResult.error;
    if (earnedResult.error) throw earnedResult.error;

    const earnedSlugs = new Set((earnedResult.data || []).map((r) => String(r.badge_slug || "")).filter(Boolean));
    const unearnedDefs = (defsResult.data || []).filter((d) => !earnedSlugs.has(String(d.slug || "")));
    const allEarned = unearnedDefs.length === 0;

    let nextUp = null;
    for (const def of unearnedDefs) {
      const progress = getProgressForDefinition(def, metric);
      const candidate = {
        slug: String(def.slug || ""),
        name: String(def.name || def.slug || "Badge"),
        family: String(def.family || ""),
        tier: Number(def.tier || 0),
        current: Number(progress.current || 0),
        required: Number(progress.required || 0),
        percent: Number(progress.percent || 0),
        label: String(progress.label || def.name || def.slug || "Badge"),
        description: formatCriteriaDescription(def.criteria)
      };
      if (!nextUp) {
        nextUp = candidate;
        continue;
      }
      if (candidate.percent > nextUp.percent) {
        nextUp = candidate;
        continue;
      }
      if (candidate.percent === nextUp.percent) {
        if (candidate.required > nextUp.required) {
          nextUp = candidate;
          continue;
        }
        if (candidate.required === nextUp.required && candidate.slug.localeCompare(nextUp.slug) < 0) {
          nextUp = candidate;
        }
      }
    }

    return res.status(200).json({ ok: true, nextUp: nextUp || null, allEarned });
  } catch (error) {
    console.error("[Badges][NextUp] failed", {
      error: error?.message || error,
      studioId,
      requestedUserId
    });
    return res.status(500).json({ ok: false, error: "Failed to compute next badge" });
  }
};
