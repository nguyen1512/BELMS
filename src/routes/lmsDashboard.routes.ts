import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { getLmsDashboard } from "../controllers/lmsDashboard.controller";

const router = Router();

router.get("/", authMiddleware, getLmsDashboard);

export default router;