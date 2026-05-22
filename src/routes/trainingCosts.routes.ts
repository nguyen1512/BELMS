import express from "express";
import {
  getTrainingCostReport,
  getTrainingCostSummary,
  getTrainingCostDepartments,
  getTrainingCostMonthlyTrend,
} from "../controllers/trainingCosts.controller";

const router = express.Router();

router.get("/", getTrainingCostReport);
router.get("/summary", getTrainingCostSummary);
router.get("/departments", getTrainingCostDepartments);
router.get("/monthly-trend", getTrainingCostMonthlyTrend);

export default router;