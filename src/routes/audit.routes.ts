import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { getAuditLogs } from "../controllers/audit.controller";

const router = Router();

router.get("/", authMiddleware, requirePermission("audit.view"), getAuditLogs);

export default router;