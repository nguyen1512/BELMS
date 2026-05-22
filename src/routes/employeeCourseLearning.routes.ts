import express from "express";
import {
  getMyCourses,
  getEmployeeCourseContent,
  getEmployeeLessonDetail,
  submitLessonQuiz,
  completeLesson,
  completeCourse,
} from "../controllers/employeeCourseLearning.controller";

const router = express.Router();

router.get("/my-courses", getMyCourses);
router.get("/courses/:courseId/content", getEmployeeCourseContent);
router.get("/lessons/:lessonId", getEmployeeLessonDetail);

router.post("/lessons/:lessonId/complete", completeLesson);
router.post("/quizzes/:quizId/submit", submitLessonQuiz);
router.post("/courses/:courseId/complete", completeCourse);

export default router;