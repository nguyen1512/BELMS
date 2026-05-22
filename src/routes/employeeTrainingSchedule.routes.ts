import express from "express";
import {
  getEmployeeTrainingSchedule,
  getEmployeeTrainingScheduleStats,
  registerLiveClass,
  checkInLiveClass,
  getDepartmentsForLiveClass,
  assignDepartmentsToLiveClass,
} from "../controllers/employeeTrainingSchedule.controller";

const router = express.Router();

/**
 * Employee training schedule
 */
router.get("/", getEmployeeTrainingSchedule);
router.get("/stats", getEmployeeTrainingScheduleStats);

router.post("/:id/register", registerLiveClass);
router.post("/:id/check-in", checkInLiveClass);

/**
 * Admin/support APIs for assigning departments to live classes
 */
router.get("/:id/departments", getDepartmentsForLiveClass);
router.post("/:id/departments", assignDepartmentsToLiveClass);

export default router;