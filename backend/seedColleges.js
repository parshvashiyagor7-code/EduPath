import dns from "node:dns";
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import College from "./models/College.js";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/edupath";

const dataPath = path.join(__dirname, "data", "College.json");
const backupDir = path.join(__dirname, "backups");

// Convert dataset branch names into frontend branch codes.
function getBranchCode(branch) {
  const value = String(branch || "")
    .toLowerCase()
    .replace(/\s*[-–—]?\s*t?fws?\s*$/i, "")
    .trim();

  if (value.includes("computer")) return "CSE";
  if (value.includes("information technology")) return "IT";
  if (value.includes("mechanical")) return "MECHANICAL";
  if (value.includes("electrical")) return "ELECTRICAL";
  if (value.includes("civil")) return "CIVIL";

  return "OTHER";
}

function normalizeRecord(item, index) {
  const name = String(item.name || "").trim();
  const branch = String(item.branch || "").trim();

  const seatType = String(item.seatType || "REGULAR")
    .trim()
    .toUpperCase();

  const category =
    seatType === "TFWS"
      ? null
      : String(item.category || "").trim().toUpperCase();

  const cutoffRank = Number(item.cutoffRank);
  const year = Number(item.year);

  if (!name || !branch) {
    throw new Error(`Missing college name or branch at record ${index + 1}`);
  }

  if (!["REGULAR", "TFWS"].includes(seatType)) {
    throw new Error(`Invalid seatType at record ${index + 1}`);
  }

  if (seatType === "REGULAR" && !category) {
    throw new Error(`Missing category at record ${index + 1}`);
  }

  if (!Number.isFinite(cutoffRank) || cutoffRank <= 0) {
    throw new Error(`Invalid cutoffRank at record ${index + 1}`);
  }

  if (!Number.isInteger(year) || year < 2000) {
    throw new Error(`Invalid year at record ${index + 1}`);
  }

  return {
    name,
    branch,
    branchCode: getBranchCode(branch),
    category,
    seatType,
    cutoffRank,
    firstRank:
      item.firstRank == null ? null : Number(item.firstRank),
    expectedCutoffRank:
      item.expectedCutoffRank == null
        ? null
        : Number(item.expectedCutoffRank),
    lastRank:
  item.lastRank == null
    ? null
    : Number(item.lastRank),
    city: item.city || undefined,
    year,
    round: String(item.round || "3"),
    quota: String(item.quota || "ACPC"),
    instituteType: String(item.instituteType || ""),
    board: String(item.board || "GUJCET").toUpperCase(),
    meritMarks:
  item.meritMarks == null
    ? null
    : Number(item.meritMarks),

sourceAcademicYear:
  item.sourceAcademicYear || undefined,
  };
}

async function main() {
  try {
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Dataset not found: ${dataPath}`);
    }

    const rawData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    if (!Array.isArray(rawData) || rawData.length === 0) {
      throw new Error("College.json must contain a non-empty JSON array.");
    }

    // Validate every record before modifying MongoDB.
    const colleges = rawData.map(normalizeRecord);

    const yearCounts = {};
    const seatCounts = {};

    for (const college of colleges) {
      yearCounts[college.year] = (yearCounts[college.year] || 0) + 1;
      seatCounts[college.seatType] =
        (seatCounts[college.seatType] || 0) + 1;
    }

    console.log("\nDataset validation successful!");
    console.log("Total records:", colleges.length);
    console.log("Year-wise records:", yearCounts);
    console.log("Seat types:", seatCounts);

    await mongoose.connect(mongoUri);
    console.log("\nMongoDB Connected");

    const replaceMode = process.argv.includes("--replace");

    // Default execution is a dry run. No records are deleted or inserted.
    if (!replaceMode) {
      console.log("\nDRY RUN COMPLETE.");
      console.log("No database records were modified.");
      console.log("Run with --replace to import the dataset.");

      return;
    }

    // Back up existing records before replacing anything.
    fs.mkdirSync(backupDir, { recursive: true });

    const existingRecords = await College.find({}).lean();

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    const backupPath = path.join(
      backupDir,
      `colleges-backup-${timestamp}.json`
    );

    fs.writeFileSync(
      backupPath,
      JSON.stringify(existingRecords, null, 2),
      "utf-8"
    );

    console.log("Backup created:", backupPath);
    console.log("Existing records:", existingRecords.length);

    try {
      // Replace only after the backup has been successfully written.
      await College.deleteMany({});

      await College.insertMany(colleges, {
        ordered: true,
      });

      console.log("\nIMPORT SUCCESSFUL!");
      console.log("Imported records:", colleges.length);
      console.log("Years:", Object.keys(yearCounts).join(", "));
    } catch (importError) {
      console.error("\nImport failed. Attempting backup restoration...");

      await College.deleteMany({});

      if (existingRecords.length > 0) {
        await College.insertMany(existingRecords, {
          ordered: true,
        });
      }

      console.log("Backup restoration completed.");
      throw importError;
    }
  } catch (error) {
    console.error("\nERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
