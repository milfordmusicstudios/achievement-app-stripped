const DIFFICULTY_ORDER = {
  easy: 1,
  moderate: 2,
  difficult: 3,
  unicorn: 4
};

const FAMILY_PRIORITY = {
  practice: 1,
  performance: 2,
  proficiency: 3,
  streaks: 4,
  memory: 5,
  book: 6,
  fun: 7
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function rankDifficulty(value) {
  const key = String(value || "").trim().toLowerCase();
  return DIFFICULTY_ORDER[key] || 999;
}

function rankFamily(value) {
  const key = String(value || "").trim().toLowerCase();
  return FAMILY_PRIORITY[key] || 999;
}

function timestampMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

export function normalizeHeroBadge(badge) {
  if (!badge || typeof badge !== "object") return null;
  const progressCurrent = toNumber(
    badge.progress_current ?? badge.current ?? badge.progressCurrent,
    0
  );
  const progressRequired = Math.max(
    1,
    toNumber(badge.progress_required ?? badge.required ?? badge.progressRequired, 1)
  );
  const progressPct =
    badge.progressPct != null
      ? clamp01(toNumber(badge.progressPct, 0))
      : clamp01(progressCurrent / progressRequired);

  return {
    id: String(badge.id || badge.slug || badge.name || "").trim(),
    slug: String(badge.slug || badge.id || "").trim(),
    name: String(badge.name || "Next Badge"),
    family: String(badge.family || "").trim().toLowerCase(),
    difficulty: String(badge.difficulty || "").trim().toLowerCase(),
    progress_current: progressCurrent,
    progress_required: progressRequired,
    progressPct,
    image_url: String(badge.image_url || "").trim(),
    description: String(badge.description || "").trim(),
    updated_at: String(badge.updated_at || badge.earned_at || "")
  };
}

export function selectHeroBadge(badges = []) {
  if (!Array.isArray(badges) || badges.length === 0) return null;
  const normalized = badges
    .map(normalizeHeroBadge)
    .filter(Boolean)
    .sort((a, b) => {
      if (b.progressPct !== a.progressPct) return b.progressPct - a.progressPct;

      const ad = rankDifficulty(a.difficulty);
      const bd = rankDifficulty(b.difficulty);
      if (ad !== bd) return ad - bd;

      const af = rankFamily(a.family);
      const bf = rankFamily(b.family);
      if (af !== bf) return af - bf;

      const au = timestampMs(a.updated_at);
      const bu = timestampMs(b.updated_at);
      if (bu !== au) return bu - au;

      return String(a.id || a.slug).localeCompare(String(b.id || b.slug));
    });

  return normalized[0] || null;
}
