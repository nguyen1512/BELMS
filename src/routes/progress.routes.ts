import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  getEnrollmentProgress,
  updateLessonProgress,
} from "../controllers/progress.controller";

const router = Router();

router.get(
  "/enrollments/:enrollmentId/progress",
  authMiddleware,
  getEnrollmentProgress
);

router.patch(
  "/enrollments/:enrollmentId/lessons/:lessonId/progress",
  authMiddleware,
  updateLessonProgress
);

export default router;