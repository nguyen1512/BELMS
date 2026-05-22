import express from "express";
import {
  createQuestionBank,
  getQuestionBankCategories,
  getQuestionBankQuestions,
  getQuestionBanks,
  getRandomQuestions,
  uploadQuestionBankFile,
  uploadQuestionBankMiddleware,
} from "../controllers/questionBanks.controller";

const router = express.Router();

/**
 * Lấy danh mục kho câu hỏi
 * GET /api/question-banks/categories
 */
router.get("/categories", getQuestionBankCategories);

/**
 * Lấy danh sách kho câu hỏi
 * GET /api/question-banks
 */
router.get("/", getQuestionBanks);

/**
 * Tạo kho câu hỏi
 * POST /api/question-banks
 */
router.post("/", createQuestionBank);

/**
 * Random câu hỏi từ một hoặc nhiều kho
 * PHẢI đặt trước /:bankId/questions
 * GET /api/question-banks/random/questions?bankIds=id1,id2&limit=10
 */
router.get("/random/questions", getRandomQuestions);

/**
 * Lấy danh sách câu hỏi trong 1 kho
 * GET /api/question-banks/:bankId/questions
 */
router.get("/:bankId/questions", getQuestionBankQuestions);

/**
 * Upload file câu hỏi vào kho
 * POST /api/question-banks/:bankId/upload
 */
router.post(
  "/:bankId/upload",
  uploadQuestionBankMiddleware,
  uploadQuestionBankFile
);

export default router;