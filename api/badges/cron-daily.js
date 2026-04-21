const { evaluateAndAwardBadges } = require("../_lib/badges/evaluate");
const { getAuthResult, getQueryParam } = require("../_lib/badges/auth");
const { buildSupabaseServiceClient } = require("../_lib/badges/supabase-admin");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = getAuthResult(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    const singleStudio = String(getQueryParam(req, "studio_id") || getQueryParam(req, "studioId") || "").trim();
    const studioIds = [];
    if (singleStudio) {
      studioIds.push(singleStudio);
    } else {
      const admin = buildSupabaseServiceClient();
      const { data, error } = await admin.from("studios").select("id");
      if (error) throw error;
      for (const row of data || []) studioIds.push(String(row.id));
    }

    const results = [];
    let awardedRows = 0;
    let seasonalStarsAdded = 0;
    let evaluatedUsers = 0;
    let succeeded = 0;
    let failed = 0;

    for (const studioId of studioIds) {
      try {
        const result = await evaluateAndAwardBadges({ studioId });
        succeeded += 1;
        awardedRows += Number(result.awardedRows || 0);
        seasonalStarsAdded += Number(result.seasonalStarsAdded || 0);
        evaluatedUsers += Number(result.evaluatedUsers || 0);
        results.push({ ok: true, ...result });
      } catch (err) {
        failed += 1;
        console.error("[Badges][Cron] studio evaluation failed", {
          studioId,
          error: err?.message || err
        });
        results.push({
          ok: false,
          studioId,
          error: err?.message || "Studio evaluation failed"
        });
      }
    }

    return res.status(200).json({
      ok: true,
      summary: {
        studiosProcessed: studioIds.length,
        studiosSucceeded: succeeded,
        studiosFailed: failed,
        evaluatedUsers,
        awardedRows,
        seasonalStarsAdded
      },
      results
    });
  } catch (error) {
    console.error("[Badges][Cron] run failed", { error: error?.message || error });
    return res.status(500).json({ ok: false, error: error.message || "Cron badge evaluation failed" });
  }
};
