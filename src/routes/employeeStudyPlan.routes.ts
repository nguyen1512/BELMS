import express from "express";
import {
  getStudyPlanCalendar,
  createStudyPlanEvent,
  updateStudyPlanEvent,
  deleteStudyPlanEvent,
  completeStudyPlanEvent,
} from "../controllers/employeeStudyPlan.controller";

const router = express.Router();

router.get("/calendar", getStudyPlanCalendar);
router.post("/events", createStudyPlanEvent);
router.put("/events/:id", updateStudyPlanEvent);
router.delete("/events/:id", deleteStudyPlanEvent);
router.patch("/events/:id/complete", completeStudyPlanEvent);

export default router;