import express from "express";
import {
  getInstructorStats,
  getInstructors,
  createInstructor,
  assignInstructorToCourse,
  deleteInstructor,
  getInstructorCourses,
  getCourseOptionsForInstructor,
} from "../controllers/instructors.controller";

const router = express.Router();

router.get("/stats", getInstructorStats);
router.get("/", getInstructors);
router.post("/", createInstructor);
router.post("/assign-course", assignInstructorToCourse);
router.get("/:id/courses", getInstructorCourses);
router.delete("/:id", deleteInstructor);
router.get("/course-options", getCourseOptionsForInstructor);

export default router;