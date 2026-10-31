
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../Components/Navbar";
import { buildApiUrl } from "../config/api";

const Predictor = () => {
  const navigate = useNavigate();

  const [options, setOptions] = useState({
    branches: [],
    categories: [],
    seatTypes: [],
    totalRecords: 0,
  });

  const [formData, setFormData] = useState({
    rank: "",
    category: "",
    branch: "",
    seatType: "REGULAR",
  });

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load dropdown options from MongoDB through backend.
  useEffect(() => {
    const loadOptions = async () => {
      try {
        setLoadingOptions(true);
        setError("");

        const response = await fetch(
          buildApiUrl("/api/predict/options")
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Unable to load predictor options."
          );
        }

        const branches =
          data.branches || data.fields?.branches || [];

        const categories =
          data.categories || data.fields?.categories || [];

        const seatTypes =
          data.seatTypes || data.fields?.seatTypes || [];

        setOptions({
          branches,
          categories,
          seatTypes,
          totalRecords: Number(data.totalRecords || 0),
        });

        setFormData((previous) => ({
          ...previous,
          branch: previous.branch || branches[0] || "",
          category: previous.category || categories[0] || "",
          seatType: seatTypes.includes(previous.seatType)
            ? previous.seatType
            : seatTypes[0] || "REGULAR",
        }));

      } catch (err) {
        console.error("Options loading error:", err);
        setError(
          err.message || "Unable to load database options."
        );
      } finally {
        setLoadingOptions(false);
      }
    };

    loadOptions();
  }, []);

  // Handle form inputs.
  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  };

  // Submit prediction request.
  const handleSubmit = async (event) => {
    event.preventDefault();

    const rank = Number(formData.rank);

    if (!Number.isFinite(rank) || rank <= 0) {
      setError("Please enter a valid positive ACPC rank.");
      return;
    }

    if (!formData.branch) {
      setError("Please select a branch.");
      return;
    }

    if (
      formData.seatType !== "TFWS" &&
      !formData.category
    ) {
      setError("Please select your category.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const payload = {
        rank,
        category:
          formData.seatType === "TFWS"
            ? ""
            : formData.category,
        seatType: formData.seatType,
        branch: formData.branch,
      };

      const response = await fetch(
        buildApiUrl("/api/predict"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Prediction could not be generated."
        );
      }

      localStorage.setItem(
        "predictionResult",
        JSON.stringify(data)
      );

      navigate("/results");

    } catch (err) {
      console.error("Prediction error:", err);
      setError(
        err.message || "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isTFWS = formData.seatType === "TFWS";

  const canSubmit =
    !loadingOptions &&
    !submitting &&
    options.branches.length > 0 &&
    options.seatTypes.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">

          <div className="text-center mb-8">
            <p className="text-sm font-semibold tracking-wide text-indigo-600 uppercase">
              EduPath · Gujarat ACPC
            </p>

            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              College Predictor
            </h1>

            <p className="text-gray-600 mt-3">
              Enter your GUJCET-based ACPC rank and preferences
              to explore colleges using historical cutoff data.
            </p>
          </div>

          {loadingOptions ? (
            <div className="py-12 text-center text-gray-600">
              Loading branches and categories from database...
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
            >

              {/* ACPC RANK */}
              <div>
                <label
                  htmlFor="rank"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Your ACPC Merit Rank
                </label>

                <input
                  id="rank"
                  name="rank"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={formData.rank}
                  onChange={handleChange}
                  placeholder="Enter your ACPC rank"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* SEAT TYPE */}
              <div>
                <label
                  htmlFor="seatType"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Seat Type
                </label>

                <select
                  id="seatType"
                  name="seatType"
                  value={formData.seatType}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {options.seatTypes.map((seatType) => (
                    <option key={seatType} value={seatType}>
                      {seatType}
                    </option>
                  ))}
                </select>

                {isTFWS && (
                  <p className="text-xs text-indigo-700 mt-2">
                    TFWS is a separate seat type, not a reservation category.
                  </p>
                )}
              </div>

              {/* CATEGORY */}
              {!isTFWS && (
                <div>
                  <label
                    htmlFor="category"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Category
                  </label>

                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    {options.categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* BRANCH */}
              <div>
                <label
                  htmlFor="branch"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Preferred Branch
                </label>

                <select
                  id="branch"
                  name="branch"
                  value={formData.branch}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {options.branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </div>

              {/* ERROR */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg bg-indigo-600 px-5 py-3.5 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {submitting
                  ? "Generating Prediction..."
                  : "Predict My Colleges"}
              </button>

            </form>
          )}

          {!loadingOptions && (
            <div className="mt-6 rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
              <p>
                <strong className="text-slate-800">
                  Dataset available:
                </strong>{" "}
                {options.totalRecords.toLocaleString("en-IN")} eligible records
              </p>

              <p className="mt-1">
                GUJCET · ACPC · Round 3 · 2024, 2025 and 2026
              </p>
            </div>
          )}

          <p className="text-xs text-gray-500 leading-relaxed mt-6">
            Predictions use the latest available historical cutoff
            as a baseline. High, Medium and Low are indicative
            rank-based labels, not guaranteed admission probabilities.
          </p>

        </div>
      </main>
    </div>
  );
};

export default Predictor;
