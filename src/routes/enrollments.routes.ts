import { Router } from "express";

import {
  getEnrollments,
  createEnrollment,
} from "../controllers/enrollments.controller";

const router = Router();

router.get("/", getEnrollments);

router.post("/", createEnrollment);

export default router;