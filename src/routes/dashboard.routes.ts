import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { getDashboardStats } from "../controllers/dashboard.controller";

const router = Router();

router.get("/", authMiddleware, getDashboardStats);

export default router;