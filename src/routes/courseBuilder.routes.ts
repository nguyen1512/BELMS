import { Router } from "express";
import {
  getCourses,
  getCourseDetail,
  createCourse,
  updateCourse,
  publishCourse,
  createSection,
  updateSection,
  deleteSection,
  createLesson,
  updateLesson,
  deleteLesson,
  uploadLessonVideo,
  uploadAssignment,
  createLessonQuiz,
  attachLibraryResource,
  getLearningTargets,
  uploadFile,
  getCourseStats,
} from "../controllers/courseBuilder.controller";

const router = Router();

router.get("/courses", getCourses);
router.get("/courses/:courseId", getCourseDetail);
router.post("/courses", createCourse);
router.put("/courses/:courseId", updateCourse);
router.patch("/courses/:courseId/publish", publishCourse);

router.get("/learning-targets", getLearningTargets);
router.get("/course-stats", getCourseStats);

router.post("/courses/:courseId/sections", createSection);
router.put("/sections/:sectionId", updateSection);
router.delete("/sections/:sectionId", deleteSection);

router.post("/sections/:sectionId/lessons", createLesson);
router.put("/lessons/:lessonId", updateLesson);
router.delete("/lessons/:lessonId", deleteLesson);

router.post("/lessons/:lessonId/video", uploadFile.single("video"), uploadLessonVideo);
router.post("/lessons/:lessonId/assignment", uploadFile.single("file"), uploadAssignment);
router.post("/lessons/:lessonId/quiz", createLessonQuiz);
router.post("/lessons/:lessonId/library-resource", attachLibraryResource);

export default router;
