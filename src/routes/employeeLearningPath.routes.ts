import { Router } from "express";
import {
  getEmployeeLearningPath,
  getEmployeeLearningPathSummary,
  getEmployeeLearningPathCourses,
} from "../controllers/employeeLearningPath.controller";

const router = Router();

router.get("/", getEmployeeLearningPath);
router.get("/summary", getEmployeeLearningPathSummary);
router.get("/courses", getEmployeeLearningPathCourses);

export default router;