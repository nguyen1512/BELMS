import { Router } from "express";
import {
  exportRankingEmployees,
  getRankingEmployees,
  getRankingSummary,
  getTopRankingEmployees,
} from "../controllers/rankings.controller";

const router = Router();

router.get("/summary", getRankingSummary);
router.get("/employees", getRankingEmployees);
router.get("/top", getTopRankingEmployees);
router.get("/export", exportRankingEmployees);

export default router;