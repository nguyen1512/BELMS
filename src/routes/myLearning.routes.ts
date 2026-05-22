import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  completeMyLesson,
  getMyLearning,
  getMyLearningDetail,
} from "../controllers/myLearning.controller";

const router = Router();

router.get("/", authMiddleware, getMyLearning);

router.get("/:enrollmentId", authMiddleware, getMyLearningDetail);

router.patch(
  "/:enrollmentId/lessons/:lessonId/complete",
  authMiddleware,
  completeMyLesson
);

export default router;