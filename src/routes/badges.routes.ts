import { Router } from "express";
import {
  getBadges,
  getBadgeStats,
  getBadgeById,
  createBadge,
  updateBadge,
  deleteBadge,
  toggleBadgeAutomation,
  getBadgeCourses,
} from "../controllers/badges.controller";

const router = Router();

router.get("/", getBadges);
router.get("/stats", getBadgeStats);
router.get("/courses", getBadgeCourses);
router.get("/:id", getBadgeById);

router.post("/", createBadge);

router.put("/:id", updateBadge);
router.patch("/:id/toggle-automation", toggleBadgeAutomation);

router.delete("/:id", deleteBadge);

export default router;