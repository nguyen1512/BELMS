import { Router } from "express";
import * as employeeDevelopmentPathController from "../controllers/employeeDevelopmentPath.controller";

const router = Router();

router.get("/", employeeDevelopmentPathController.getEmployeeDevelopmentPathPage);

router.get("/summary", employeeDevelopmentPathController.getDevelopmentSummary);

router.get("/roadmap", employeeDevelopmentPathController.getDevelopmentRoadmap);

router.get("/competency", employeeDevelopmentPathController.getCompetencyRadar);

router.get(
  "/recommended-courses",
  employeeDevelopmentPathController.getRecommendedCourses
);

router.get(
  "/achievements",
  employeeDevelopmentPathController.getDevelopmentAchievements
);

export default router;