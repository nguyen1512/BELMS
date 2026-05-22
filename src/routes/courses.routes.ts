import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createCourse,
  deleteCourse,
  getCourses,
  updateCourse,
} from "../controllers/courses.controller";

const router = Router();

router.get("/", authMiddleware, getCourses);
router.post("/", authMiddleware, createCourse);
router.patch("/:id", authMiddleware, updateCourse);
router.delete("/:id", authMiddleware, deleteCourse);

export default router;