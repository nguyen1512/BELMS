import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createLesson,
  deleteLesson,
  getLessonsByCourse,
  updateLesson,
} from "../controllers/lessons.controller";

const router = Router();

router.get("/courses/:courseId/lessons", authMiddleware, getLessonsByCourse);
router.post("/courses/:courseId/lessons", authMiddleware, createLesson);
router.patch("/lessons/:id", authMiddleware, updateLesson);
router.delete("/lessons/:id", authMiddleware, deleteLesson);

export default router;