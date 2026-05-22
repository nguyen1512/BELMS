import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createCourseCategory,
  deleteCourseCategory,
  getCourseCategories,
  updateCourseCategory,
} from "../controllers/courseCategories.controller";

const router = Router();

router.get("/", authMiddleware, getCourseCategories);
router.post("/", authMiddleware, createCourseCategory);
router.patch("/:id", authMiddleware, updateCourseCategory);
router.delete("/:id", authMiddleware, deleteCourseCategory);

export default router;