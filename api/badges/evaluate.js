const { evaluateAndAwardBadges } = require("../_lib/badges/evaluate");
const { getAuthResult } = require("../_lib/badges/auth");

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = getAuthResult(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const body = parseBody(req);
  const studioId = String(body.studioId || body.studio_id || "").trim();
  const userId = String(body.userId || body.user_id || "").trim() || undefined;
  if (!studioId) {
    return res.status(400).json({ ok: false, error: "Missing studioId" });
  }

  try {
    const result = await evaluateAndAwardBadges({ studioId, userId });
    return res.status(200).json({
      ok: true,
      summary: {
        studioId: result.studioId,
        evaluatedUsers: result.evaluatedUsers,
        awardedRows: result.awardedRows,
        seasonalStarsAdded: result.seasonalStarsAdded
      },
      result
    });
  } catch (error) {
    console.error("[Badges][Evaluate] failed", {
      studioId,
      userId,
      error: error?.message || error
    });
    return res.status(500).json({ ok: false, error: error.message || "Badge evaluation failed" });
  }
};
