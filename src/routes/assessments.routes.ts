import { Router } from "express";
import {
  getAssessmentCourses,
  getLessonsByCourse,
  getAssessments,
  getAssessmentDetail,
  createAssessment,
  deleteAssessment,
  getAssessmentRandomQuestions,
} from "../controllers/assessments.controller";

const router = Router();

router.get("/courses/list", getAssessmentCourses);
router.get("/courses/:courseId/lessons", getLessonsByCourse);

router.get("/", getAssessments);
router.post("/", createAssessment);
router.get("/:id", getAssessmentDetail);
router.delete("/:id", deleteAssessment);
router.get("/:id/questions/random", getAssessmentRandomQuestions);

export default router;
