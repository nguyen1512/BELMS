import express from "express";
import {
  getLiveClasses,
  getLiveClassById,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
  getLiveClassStats,
} from "../controllers/liveClasses.controller";

const router = express.Router();

router.get("/", getLiveClasses);
router.get("/stats", getLiveClassStats);
router.get("/:id", getLiveClassById);
router.post("/", createLiveClass);
router.put("/:id", updateLiveClass);
router.delete("/:id", deleteLiveClass);

export default router;