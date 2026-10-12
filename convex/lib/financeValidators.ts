import { v } from "convex/values";

export const financeClassificationValidator = v.union(
  v.literal("earned_income"), v.literal("expense"), v.literal("transfer"),
  v.literal("opening_balance"), v.literal("loan_advance"),
  v.literal("principal_repayment"), v.literal("funding_distribution")
);
