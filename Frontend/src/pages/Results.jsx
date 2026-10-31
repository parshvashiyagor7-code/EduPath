import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../Components/Navbar";

const normalizeInstituteType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("self")) return "Self-Finance";
  if (
    normalized.includes("government") ||
    normalized.includes("govt") ||
    normalized.includes("gia") ||
    normalized.includes("grant in aid") ||
    normalized.includes("auto")
  ) {
    return "Government";
  }
  return value || "-";
};

const getChanceBadge = (chance) => {
  if (chance === "High") return "bg-emerald-100 text-emerald-700";
  if (chance === "Medium") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
};

const getChancePriority = (chance) => {
  if (chance === "High") return 0;
  if (chance === "Medium") return 1;
  return 2;
};

const showValue = (value) =>
  value === null || value === undefined || value === "" ? "-" : value;

const SHORTLIST_STORAGE_KEY = "shortlistedColleges";

const buildShortlistId = (college) =>
  college._id ||
  `${college.name}-${college.branch}-${college.category}-${college.seatType}-${college.year || "na"}-${college.round || "na"}`;

const readShortlistFromStorage = () => {
  try {
    const raw = localStorage.getItem(SHORTLIST_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeShortlistToStorage = (items) => {
  localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(items));
};

const Results = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collegeTypeFilter, setCollegeTypeFilter] = useState("all");
  const [resultScope, setResultScope] = useState("recommended");
  const [shortlistedIds, setShortlistedIds] = useState(new Set());

  useEffect(() => {
    const existing = readShortlistFromStorage();
    setShortlistedIds(new Set(existing.map((item) => item.shortlistId)));
  }, []);

  useEffect(() => {
    try {
      const storedResult = localStorage.getItem("predictionResult");
      if (!storedResult) {
        setError("No prediction data found. Please try predicting again.");
        return;
      }

      const parsedResult = JSON.parse(storedResult);
      if (!parsedResult || typeof parsedResult !== "object") {
        throw new Error("Invalid prediction data.");
      }
      setResults(parsedResult);
    } catch (err) {
      console.error("Result loading error:", err);
      setError("Unable to load prediction results. Please predict again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const tableRows = useMemo(() => {
    if (!results) return [];

    const inputRank = Number(results.inputRank);
    const hasInputRank = Number.isFinite(inputRank) && inputRank > 0;

    return [...(results.safe || []), ...(results.target || []), ...(results.dream || [])]
      .map((college) => {
        const predictedRank = Number(
          college.predictedCutoffRank ?? college.cutoffRank ?? college.expectedCutoffRank ?? 0
        );
        return {
          ...college,
          instituteTypeLabel: normalizeInstituteType(college.instituteType),
          displayCutoffRank: predictedRank,
          rankGapAbs: hasInputRank
            ? Math.abs(predictedRank - inputRank)
            : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((left, right) => {
        const chanceDiff = getChancePriority(left.chance) - getChancePriority(right.chance);
        if (chanceDiff !== 0) return chanceDiff;
        const gapDiff = left.rankGapAbs - right.rankGapAbs;
        if (gapDiff !== 0) return gapDiff;
        return left.displayCutoffRank - right.displayCutoffRank;
      });
  }, [results]);

  const filteredRows = useMemo(
    () =>
      tableRows.filter((college) => {
        if (resultScope === "recommended" && college.chance === "Low") return false;
        if (
          collegeTypeFilter === "self-finance" &&
          college.instituteTypeLabel !== "Self-Finance"
        ) {
          return false;
        }
        if (
          collegeTypeFilter === "government" &&
          college.instituteTypeLabel !== "Government"
        ) {
          return false;
        }
        return true;
      }),
    [tableRows, collegeTypeFilter, resultScope]
  );

  const recommendedCount = useMemo(
    () => tableRows.filter((college) => college.chance !== "Low").length,
    [tableRows]
  );

  useEffect(() => {
    if (resultScope === "recommended" && recommendedCount === 0 && tableRows.length > 0) {
      setResultScope("all");
    }
  }, [resultScope, recommendedCount, tableRows.length]);

  const toggleShortlist = (college) => {
    const shortlistId = buildShortlistId(college);
    const existing = readShortlistFromStorage();
    const alreadySaved = existing.some((item) => item.shortlistId === shortlistId);

    let updated;
    if (alreadySaved) {
      updated = existing.filter((item) => item.shortlistId !== shortlistId);
    } else {
      updated = [
        {
          shortlistId,
          ...college,
          instituteTypeLabel: normalizeInstituteType(college.instituteType),
          savedAt: new Date().toISOString(),
        },
        ...existing,
      ];
    }

    writeShortlistToStorage(updated);
    setShortlistedIds(new Set(updated.map((item) => item.shortlistId)));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="h-16 w-16 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-96 px-4">
          <p className="text-red-600 text-xl font-semibold text-center mb-4">{error}</p>
          <Link
            to="/predict"
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Try Prediction Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navbar />

      <div className="w-full max-w-screen-2xl mx-auto px-3 sm:px-5 lg:px-8 py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-3">
          Your College Predictions
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Colleges matched with your ACPC rank, category and selected branch.
        </p>

        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-6">
            <div>
              <p className="text-gray-700 text-sm md:text-base">
                {resultScope === "recommended"
                  ? `Showing recommended colleges (High + Medium). Count: ${filteredRows.length}`
                  : `Showing all colleges. Count: ${filteredRows.length}`}
              </p>

              <p className="text-sm text-blue-700 mt-2">
                Your Rank: <strong>{showValue(results.inputRank)}</strong>
                {" | "}
                Category: <strong>{results.seatType === "TFWS" ? "TFWS" : showValue(results.categoryUsed)}</strong>
                {" | "}
                Seat Type: <strong>{showValue(results.seatType || "REGULAR")}</strong>
              </p>

              <p className="text-sm text-gray-600 mt-2">
                Historical Years: <strong>{(results.yearsUsed || []).join(", ") || "-"}</strong>
              </p>

              <p className="text-sm text-indigo-700 mt-2">
                Forecast Method: <strong>Latest Available Year Baseline</strong>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Each college uses its latest available historical Round 3 cutoff as the baseline.
                Check the Year and Round columns for the source record.
              </p>

              <p className="text-sm text-blue-700 mt-2">
                Shortlisted: <strong>{shortlistedIds.size}</strong>{" · "}
                <Link to="/shortlist" className="font-semibold underline hover:text-blue-900">
                  Open Shortlist
                </Link>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="resultScope" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Results
                </label>
                <select
                  id="resultScope"
                  value={resultScope}
                  onChange={(event) => setResultScope(event.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="recommended">Recommended</option>
                  <option value="all">All (include low chance)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="collegeType" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  College Type
                </label>
                <select
                  id="collegeType"
                  value={collegeTypeFilter}
                  onChange={(event) => setCollegeTypeFilter(event.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="self-finance">Self-Finance</option>
                  <option value="government">Government</option>
                </select>
              </div>
            </div>
          </div>

          <div className="w-full max-w-full overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[1450px] table-auto text-sm text-left">
              <thead className="bg-slate-100 text-gray-700">
                <tr>
                  <th className="px-4 py-4 font-semibold w-[260px]">College</th>
                  <th className="px-4 py-4 font-semibold w-[300px]">Branch</th>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">Allotted Category</th>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">Quota</th>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">Institute Type</th>
                  <th className="px-4 py-4 font-semibold">City</th>
                  <th className="px-4 py-4 font-semibold">Year</th>
                  <th className="px-4 py-4 font-semibold">Round</th>
                  <th className="px-4 py-4 font-semibold min-w-[200px]">Predicted Cutoff Rank</th>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">Last Rank</th>
                  <th className="px-4 py-4 font-semibold">Chance</th>
                  <th className="px-4 py-4 font-semibold">Shortlist</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length > 0 ? (
                  filteredRows.map((college) => {
                    const shortlistId = buildShortlistId(college);
                    const isSaved = shortlistedIds.has(shortlistId);
                    const predictedRank = college.predictedCutoffRank ?? college.cutoffRank;
                    const categoryLabel = college.seatType === "TFWS" ? "TFWS" : showValue(college.category);

                    return (
                      <tr
                        key={college._id || shortlistId}
                        className="border-t border-gray-100 even:bg-slate-50 hover:bg-blue-50 transition-colors"
                      >
                        <td className="px-4 py-4 text-gray-800 font-medium align-top w-[260px] max-w-[260px] whitespace-normal break-words">
                          {showValue(college.name)}
                        </td>
                        <td className="px-4 py-4 text-gray-700 align-top w-[300px] max-w-[300px] whitespace-normal break-words">
                          {showValue(college.branch)}
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap align-top">
                          {categoryLabel}
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap align-top">
                          {showValue(college.quota)}
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap align-top">
                          {normalizeInstituteType(college.instituteType)}
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap align-top">
                          {showValue(college.city)}
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap align-top">
                          {showValue(college.year)}
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap align-top">
                          {showValue(college.round)}
                        </td>
                        <td className="px-4 py-4 text-gray-900 font-semibold whitespace-nowrap align-top">
                          {Number(predictedRank).toLocaleString("en-IN")}
                          {Array.isArray(college.historicalCutoffs) && college.historicalCutoffs.length > 1 && (
                            <details className="mt-2 text-xs font-normal text-gray-600">
                              <summary className="cursor-pointer text-indigo-700">Historical cutoffs</summary>
                              <div className="mt-1 space-y-1">
                                {college.historicalCutoffs.map((item) => (
                                  <p key={`${item.year}-${item.round}`}>
                                    {item.year} · Round {item.round}: {showValue(item.cutoffRank).toLocaleString?.("en-IN") ?? showValue(item.cutoffRank)}
                                  </p>
                                ))}
                              </div>
                            </details>
                          )}
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap align-top">
                          {showValue(college.lastRank ?? college.cutoffRank)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap align-top">
                          <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${getChanceBadge(college.chance)}`}>
                            {college.chance}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap align-top">
                          <button
                            type="button"
                            onClick={() => toggleShortlist(college)}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                              isSaved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                            }`}
                          >
                            {isSaved ? "Saved" : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                      {tableRows.length > 0
                        ? "No colleges found for selected filters. Try changing college type or result scope."
                        : "No colleges found for your input. Try a different branch, category or rank."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-lg bg-blue-50 border border-blue-100 p-4">
            <p className="text-sm text-blue-900 font-semibold mb-1">Understanding your prediction</p>
            <p className="text-xs sm:text-sm text-blue-800 leading-relaxed">
              The displayed cutoff is a baseline taken from the latest available historical
              GUJCET/ACPC Round 3 record for each college and branch. High, Medium and Low
              are indicative classifications based on the difference between your rank and
              that historical cutoff; they are not guaranteed admission probabilities. Final
              allotment depends on ACPC rules, seat availability and counselling outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;
