import express from "express";
import {
  createLearningPath,
  getLearningPaths,
  getLearningPathById,
  deleteLearningPath,
  updateLearningPath,
} from "../controllers/learningPaths.controller";

const router = express.Router();

router.get("/", getLearningPaths);
router.get("/:id", getLearningPathById);
router.post("/", createLearningPath);
router.put("/:id", updateLearningPath);
router.delete("/:id", deleteLearningPath);

export default router;