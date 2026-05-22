import express from "express";
import {
  getLearningOverviewReport,
  getReportFilters,
  getStudyTimeReport,
} from "../controllers/reports.controller";

const router = express.Router();

router.get("/overview", getLearningOverviewReport);
router.get("/filters", getReportFilters);
router.get("/study-time", getStudyTimeReport);

export default router;