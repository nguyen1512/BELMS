import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createQuiz,
  createQuizQuestion,
  getQuizQuestions,
  getQuizzesByCourse,
  submitQuiz,
} from "../controllers/quizzes.controller";

const router = Router();

router.get("/courses/:courseId/quizzes", authMiddleware, getQuizzesByCourse);
router.post("/courses/:courseId/quizzes", authMiddleware, createQuiz);

router.get("/quizzes/:quizId/questions", authMiddleware, getQuizQuestions);
router.post("/quizzes/:quizId/questions", authMiddleware, createQuizQuestion);

router.post("/quizzes/:quizId/submit", authMiddleware, submitQuiz);

export default router;