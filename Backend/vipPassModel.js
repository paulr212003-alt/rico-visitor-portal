const mongoose = require("mongoose");

const vipPassSchema = new mongoose.Schema(
  {
    vipAccessId: { type: String, required: true, unique: true, index: true, trim: true },
    label: { type: String, default: "VIP", trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
    issueCount: { type: Number, default: 0 },
    lastIssuedPassId: { type: String, default: "", trim: true },
    lastIssuedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VipPass", vipPassSchema, "vipPasses");
