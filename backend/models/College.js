
import mongoose from "mongoose";

const collegeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    branch: {
      type: String,
      required: true,
      trim: true,
    },

    branchCode: {
  type: String,
  required: true,
  uppercase: true,
  trim: true,
},

    // TFWS records have no reservation category in the source dataset.
    category: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    meritMarks: {
  type: Number,
  default: null,
},

sourceAcademicYear: {
  type: String,
  trim: true,
},

    // REGULAR or TFWS
    seatType: {
      type: String,
      enum: ["REGULAR", "TFWS"],
      default: "REGULAR",
      uppercase: true,
      trim: true,
    },

    cutoffRank: {
      type: Number,
      required: true,
    },
    firstRank: {
      type: Number,
      default: null,
    },
    expectedCutoffRank: {
      type: Number,
      default: null,
    },
    lastRank: {
      type: Number,
      default: null,
    },

    city: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
    },
    round: {
      type: String,
      trim: true,
    },
    quota: {
      type: String,
      trim: true,
    },
    instituteType: {
      type: String,
      trim: true,
    },
    board: {
      type: String,
      trim: true,
      uppercase: true,
      default: "GUJCET",
    },
  },
  { timestamps: true }
);

collegeSchema.index({
  category: 1,
  seatType: 1,
  branchCode: 1,
  board: 1,
  year: -1,
  cutoffRank: 1,
});

collegeSchema.index({ name: 1, branch: 1, year: 1 });

export default mongoose.model("College", collegeSchema);
