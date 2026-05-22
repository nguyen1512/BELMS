import { Router } from "express";
import {
  getRandomEntranceTestQuestions,
  checkEntranceTestAnswer,
  submitEntranceTest,
  getMyEntranceTestHistory,
  getEntranceTestQuestionBank,
  createEntranceTestQuestion,
  updateEntranceTestQuestion,
  deleteEntranceTestQuestion,
} from "../controllers/entranceTest.controller";

const router = Router();

/**
 * STUDENT
 */
router.get("/questions/random", getRandomEntranceTestQuestions);
router.post("/answers/check", checkEntranceTestAnswer);
router.post("/submit", submitEntranceTest);
router.get("/history/:userId", getMyEntranceTestHistory);

/**
 * ADMIN QUESTION BANK
 */
router.get("/question-bank", getEntranceTestQuestionBank);
router.post("/question-bank", createEntranceTestQuestion);
router.put("/question-bank/:id", updateEntranceTestQuestion);
router.delete("/question-bank/:id", deleteEntranceTestQuestion);

export default router;