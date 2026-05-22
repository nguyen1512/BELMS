import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  approveCourseRegistration,
  createCourseRegistration,
  getCourseRegistrations,
  rejectCourseRegistration,
} from "../controllers/courseRegistrations.controller";

const router = Router();

router.get("/", authMiddleware, getCourseRegistrations);
router.post("/", authMiddleware, createCourseRegistration);
router.patch("/:id/approve", authMiddleware, approveCourseRegistration);
router.patch("/:id/reject", authMiddleware, rejectCourseRegistration);

export default router;