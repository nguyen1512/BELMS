import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  approveSubscription,
  createSubscription,
  getSubscriptions,
  rejectSubscription,
} from "../controllers/subscriptions.controller";

const router = Router();

router.get("/", authMiddleware, getSubscriptions);
router.post("/", authMiddleware, createSubscription);
router.patch("/:id/approve", authMiddleware, approveSubscription);
router.patch("/:id/reject", authMiddleware, rejectSubscription);

export default router;