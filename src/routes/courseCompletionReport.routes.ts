import { Router } from "express";
import {
  getCertificateConditions,
  getCompletionByCourses,
  getCompletionDetails,
  getCompletionFilters,
  getCompletionReportOverview,
  getCompletionSummary,
} from "../controllers/courseCompletionReport.controller";

const router = Router();

router.get("/", getCompletionReportOverview);
router.get("/summary", getCompletionSummary);
router.get("/courses", getCompletionByCourses);
router.get("/details", getCompletionDetails);
router.get("/filters", getCompletionFilters);
router.get("/certificate-conditions", getCertificateConditions);

export default router;