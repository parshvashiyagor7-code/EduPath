
import express from "express";
import College from "../models/College.js";

const router = express.Router();

// ======================================================
// CONFIGURATION
// ======================================================

const ELIGIBLE_YEARS = [2024, 2025, 2026];

const PREDICTION_SOURCE_FILTER = {
  board: "GUJCET",
  quota: "ACPC",
  round: "3",
  year: { $in: ELIGIBLE_YEARS },
};

const CATEGORY_ALIASES = {
  GEN: "OPEN",
  GENERAL: "OPEN",
  UR: "OPEN",
  OBC: "SEBC",
  "OBC-PH": "SEBC-PH",
  OBCPH: "SEBC-PH",
  SEBCPH: "SEBC-PH",
};

// ======================================================
// GENERAL HELPERS
// ======================================================

const normalizeCategory = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

  if (!normalized) return "";

  return CATEGORY_ALIASES[normalized] || normalized;
};

const escapeRegex = (value) =>
  String(value ?? "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

const stripSeatSuffix = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s*-\s*TFWS?\s*$/i, "")
    .trim();

const makeBranchPattern = (branch) => {
  const cleanBranch = stripSeatSuffix(branch);

  return `^${escapeRegex(
    cleanBranch
  )}(?:\\s*-\\s*TFWS?)?$`;
};

const sortedUniqueStrings = (values) =>
  [
    ...new Set(
      (values || [])
        .filter(
          (value) =>
            value !== null &&
            value !== undefined
        )
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

const resolveValidYear = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 2000
    ? parsed
    : null;
};

// Safely get the actual closing rank.
const getRecordCutoffRank = (record) => {
  const candidates = [
    record?.lastRank,
    record?.cutoffRank,
  ];

  for (const candidate of candidates) {
    if (
      candidate === null ||
      candidate === undefined ||
      String(candidate).trim() === ""
    ) {
      continue;
    }

    const value = Number(candidate);

    if (
      Number.isFinite(value) &&
      value > 0
    ) {
      return value;
    }
  }

  return null;
};

// ======================================================
// HISTORICAL STATISTICS
// ======================================================

const getMedian = (values) => {
  if (!values.length) return null;

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const middle = Math.floor(
    sorted.length / 2
  );

  if (sorted.length % 2 === 0) {
    return (
      sorted[middle - 1] +
      sorted[middle]
    ) / 2;
  }

  return sorted[middle];
};

// Calculate one representative cutoff per year.
// Duplicate records in one year are combined by median.
const getHistoricalCutoffStats = (history) => {
  const yearMap = new Map();

  for (const record of history) {
    const year = Number(record.year);

    const cutoff = getRecordCutoffRank(record);

    if (
      !Number.isFinite(year) ||
      cutoff === null
    ) {
      continue;
    }

    if (!yearMap.has(year)) {
      yearMap.set(year, []);
    }

    yearMap.get(year).push(cutoff);
  }

  const yearlyCutoffs = [
    ...yearMap.entries(),
  ]
    .map(([year, values]) => ({
      year,
      cutoff: getMedian(values),
    }))
    .filter(
      (item) => item.cutoff !== null
    )
    .sort(
      (a, b) => a.year - b.year
    )
    .slice(-3);

  if (!yearlyCutoffs.length) {
    return null;
  }

  const cutoffs = yearlyCutoffs.map(
    (item) => item.cutoff
  );

  const minimumCutoff = Math.min(
    ...cutoffs
  );

  const maximumCutoff = Math.max(
    ...cutoffs
  );

  const medianCutoff = getMedian(
    cutoffs
  );

  // Historical spread relative to median.
  const volatility =
    medianCutoff > 0
      ? (maximumCutoff - minimumCutoff) /
        medianCutoff
      : 0;

  return {
    yearlyCutoffs,
    yearCount: yearlyCutoffs.length,
    minimumCutoff,
    maximumCutoff,
    medianCutoff,
    volatility,
  };
};

// ======================================================
// IMPROVED CHANCE CLASSIFICATION
// ======================================================

const classifyChance = (
  studentRank,
  history
) => {
  if (
    !Number.isFinite(studentRank) ||
    studentRank <= 0
  ) {
    return "Low";
  }

  const stats = getHistoricalCutoffStats(
    history
  );

  if (!stats) {
    return "Low";
  }

  const {
    yearCount,
    minimumCutoff,
    maximumCutoff,
    volatility,
  } = stats;

  /*
    HIGH:
    Student rank should be comfortably better
    than the most competitive historical cutoff.

    Fewer historical years = larger safety margin.
    More cutoff fluctuation = larger safety margin.
  */

  const dataPenalty =
    yearCount >= 3
      ? 0
      : yearCount === 2
        ? 0.05
        : 0.15;

  const volatilityPenalty = Math.min(
    volatility * 0.20,
    0.10
  );

  const safetyMargin = Math.min(
    0.35,
    0.10 +
      dataPenalty +
      volatilityPenalty
  );

  const highThreshold =
    minimumCutoff *
    (1 - safetyMargin);

  /*
    MEDIUM:
    Rank is within a small tolerance of
    the most favourable historical closing rank.
  */

  const mediumTolerance =
    yearCount >= 3
      ? 0.05
      : yearCount === 2
        ? 0.025
        : 0;

  const mediumThreshold =
    maximumCutoff *
    (1 + mediumTolerance);

  if (studentRank <= highThreshold) {
    return "High";
  }

  if (studentRank <= mediumThreshold) {
    return "Medium";
  }

  return "Low";
};

// ======================================================
// DYNAMIC OPTIONS API
// ======================================================

router.get("/options", async (req, res) => {
  try {
    const [
      rawBranches,
      rawCategories,
      rawSeatTypes,
      rawInstituteTypes,
      rawCities,
      rawYears,
      rawRounds,
      rawQuotas,
      rawBoards,
      totalRecords,
    ] = await Promise.all([
      College.distinct(
        "branch",
        PREDICTION_SOURCE_FILTER
      ),

      College.distinct("category", {
        ...PREDICTION_SOURCE_FILTER,
        seatType: "REGULAR",
        category: {
          $nin: [null, ""],
        },
      }),

      College.distinct(
        "seatType",
        PREDICTION_SOURCE_FILTER
      ),

      College.distinct(
        "instituteType",
        PREDICTION_SOURCE_FILTER
      ),

      College.distinct(
        "city",
        PREDICTION_SOURCE_FILTER
      ),

      College.distinct(
        "year",
        PREDICTION_SOURCE_FILTER
      ),

      College.distinct(
        "round",
        PREDICTION_SOURCE_FILTER
      ),

      College.distinct(
        "quota",
        PREDICTION_SOURCE_FILTER
      ),

      College.distinct(
        "board",
        PREDICTION_SOURCE_FILTER
      ),

      College.countDocuments(
        PREDICTION_SOURCE_FILTER
      ),
    ]);

    // Normalize branch options.
    const branchMap = new Map();

    for (const rawBranch of rawBranches) {
      const cleanBranch =
        stripSeatSuffix(rawBranch);

      if (
        cleanBranch &&
        !branchMap.has(
          cleanBranch.toLowerCase()
        )
      ) {
        branchMap.set(
          cleanBranch.toLowerCase(),
          cleanBranch
        );
      }
    }

    const branches = [
      ...branchMap.values(),
    ].sort((a, b) =>
      a.localeCompare(b)
    );

    const categories = [
      ...new Set(
        rawCategories
          .map(normalizeCategory)
          .filter(Boolean)
      ),
    ].sort((a, b) =>
      a.localeCompare(b)
    );

    const seatTypes =
      sortedUniqueStrings(
        rawSeatTypes
      ).map((value) =>
        value.toUpperCase()
      );

    const fields = {
      branches,
      categories,
      seatTypes,

      instituteTypes:
        sortedUniqueStrings(
          rawInstituteTypes
        ),

      cities:
        sortedUniqueStrings(
          rawCities
        ),

      years: [
        ...new Set(
          rawYears
            .map(Number)
            .filter(Number.isFinite)
        ),
      ].sort((a, b) => b - a),

      rounds:
        sortedUniqueStrings(
          rawRounds
        ),

      quotas:
        sortedUniqueStrings(
          rawQuotas
        ),

      boards:
        sortedUniqueStrings(
          rawBoards
        ),
    };

    return res.json({
      ...fields,
      fields,
      totalRecords,
    });

  } catch (error) {
    console.error(
      "Prediction options error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to load prediction options from the college dataset.",
    });
  }
});

// ======================================================
// COLLEGE SEARCH API
// ======================================================

router.get("/search", async (req, res) => {
  try {
    const {
      q,
      city,
      branch,
      category,
      instituteType,
      quota,
      round,
      year,
      seatType,
      board,
      limit,
      skip,
    } = req.query;

    const parsedLimit = Math.min(
      Math.max(Number(limit) || 50, 1),
      200
    );

    const parsedSkip = Math.max(
      Number(skip) || 0,
      0
    );

    const baseQuery = {};

    if (q) {
      baseQuery.name = {
        $regex: escapeRegex(q),
        $options: "i",
      };
    }

    if (city) {
      baseQuery.city = {
        $regex: `^${escapeRegex(city)}$`,
        $options: "i",
      };
    }

    if (branch) {
      baseQuery.branch = {
        $regex: makeBranchPattern(branch),
        $options: "i",
      };
    }

    if (category) {
      baseQuery.category =
        normalizeCategory(category);
    }

    if (instituteType) {
      baseQuery.instituteType = {
        $regex: `^${escapeRegex(
          instituteType
        )}$`,
        $options: "i",
      };
    }

    if (quota) {
      baseQuery.quota = {
        $regex: `^${escapeRegex(quota)}$`,
        $options: "i",
      };
    }

    if (round) {
      baseQuery.round = {
        $regex: `^${escapeRegex(round)}$`,
        $options: "i",
      };
    }

    if (seatType) {
      baseQuery.seatType = String(seatType)
        .trim()
        .toUpperCase();
    }

    if (board) {
      baseQuery.board = String(board)
        .trim()
        .toUpperCase();
    }

    const resolvedYear =
      resolveValidYear(year);

    if (resolvedYear !== null) {
      baseQuery.year = resolvedYear;
    }

    const [total, colleges] =
      await Promise.all([
        College.countDocuments(baseQuery),

        College.find(baseQuery)
          .sort({
            year: -1,
            cutoffRank: 1,
            name: 1,
          })
          .skip(parsedSkip)
          .limit(parsedLimit)
          .lean(),
      ]);

    return res.json({
      total,
      limit: parsedLimit,
      skip: parsedSkip,
      latestYear: resolvedYear,
      colleges,
    });

  } catch (error) {
    console.error(
      "College search error:",
      error
    );

    return res.status(500).json({
      message: "College search error.",
    });
  }
});

// ======================================================
// PREDICTION API
// NO BACKTEST / NO RELIABILITY METRICS
// ======================================================

router.post("/", async (req, res) => {
  const rank = Number(req.body?.rank);

  const rawCategory = String(
    req.body?.category ?? ""
  )
    .trim()
    .toUpperCase();

  const requestedSeatType = String(
    req.body?.seatType ?? ""
  )
    .trim()
    .toUpperCase();

  const rawBranch = String(
    req.body?.branch ?? ""
  ).trim();

  // TFWS is a seat type, not a reservation category.
  const isTFWS =
    rawCategory === "TFWS" ||
    requestedSeatType === "TFWS";

  const category = isTFWS
    ? null
    : normalizeCategory(rawCategory);

  const branch = stripSeatSuffix(
    rawBranch
  );

  try {
    // Validate input.
    if (
      !Number.isFinite(rank) ||
      rank <= 0 ||
      !branch ||
      (!category && !isTFWS)
    ) {
      return res.status(400).json({
        message:
          "A valid rank, category (or TFWS seat type), and branch are required.",
      });
    }

    // Build exact ACPC prediction query.
    const query = {
      ...PREDICTION_SOURCE_FILTER,

      branch: {
        $regex: makeBranchPattern(branch),
        $options: "i",
      },

      seatType: isTFWS
        ? "TFWS"
        : "REGULAR",

      ...(isTFWS
        ? { category: null }
        : { category }),
    };

    // Fetch matching historical data.
    const records = await College.find(query)
      .sort({
        year: -1,
        round: -1,
      })
      .lean();

    if (!records.length) {
      return res.status(404).json({
        message:
          "No matching Round 3 GUJCET/ACPC cutoff records were found for this category and branch in 2024-2026.",

        categoryUsed: category,

        seatType: isTFWS
          ? "TFWS"
          : "REGULAR",

        branchUsed: branch,
      });
    }

    // Group by college and normalized branch.
    const grouped = new Map();

    for (const record of records) {
      const canonicalBranch =
        stripSeatSuffix(
          record.branch
        ).toLowerCase();

      const key =
        `${record.name}__${canonicalBranch}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(record);
    }

    const colleges = [];

    // Calculate baseline and classification.
    for (const history of grouped.values()) {
      const sortedHistory = [
        ...history,
      ].sort(
        (a, b) =>
          Number(b.year || 0) -
          Number(a.year || 0)
      );

      const latest = sortedHistory[0];

      // Latest historical closing rank is the baseline.
      const predictedCutoffRank =
        getRecordCutoffRank(latest);

      if (predictedCutoffRank === null) {
        continue;
      }

      // Preserve all available historical cutoffs.
      const historicalCutoffs =
        sortedHistory.map((item) => ({
          year: Number(item.year),
          round: item.round,

          cutoffRank:
            getRecordCutoffRank(item),

          firstRank:
            item.firstRank ?? null,

          lastRank:
            item.lastRank ??
            item.cutoffRank ??
            null,
        }));

      // Improved classification using all available years.
      const chance = classifyChance(
        rank,
        sortedHistory
      );

      colleges.push({
        ...latest,

        branch: stripSeatSuffix(
          latest.branch
        ),

        cutoffRank: Math.round(
          predictedCutoffRank
        ),

        predictedCutoffRank: Math.round(
          predictedCutoffRank
        ),

        historicalCutoffs,
        chance,
      });
    }

    // Divide colleges into result groups.
    const safe = colleges.filter(
      (college) =>
        college.chance === "High"
    );

    const target = colleges.filter(
      (college) =>
        college.chance === "Medium"
    );

    const dream = colleges.filter(
      (college) =>
        college.chance === "Low"
    );

    const yearsUsed = [
      ...new Set(
        records
          .map((record) =>
            Number(record.year)
          )
          .filter(Number.isFinite)
      ),
    ].sort((a, b) => a - b);

    return res.json({
      inputRank: rank,

      safe,
      target,
      dream,

      yearsUsed,

      categoryUsed: category,

      seatType: isTFWS
        ? "TFWS"
        : "REGULAR",

      branchUsed: branch,

      forecastMethod:
        "LATEST_AVAILABLE_YEAR_BASELINE",

      forecastBasedOnYear:
        Math.max(...yearsUsed),

      usedFallbackCategory: false,
    });

  } catch (error) {
    console.error(
      "Prediction error:",
      error
    );

    return res.status(500).json({
      message:
        "Prediction error. Please try again.",
    });
  }
});

export default router;
