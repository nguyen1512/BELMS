import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import {
  getPermissions,
  getRolePermissions,
  getRoles,
  updateRolePermissions,
} from "../controllers/roles.controller";

const router = Router();

router.get("/", authMiddleware, requirePermission("roles.view"), getRoles);

router.get("/permissions", authMiddleware, requirePermission("roles.view"), getPermissions);

router.get("/:id/permissions", authMiddleware, requirePermission("roles.view"), getRolePermissions);

router.patch(
  "/:id/permissions",
  authMiddleware,
  requirePermission("roles.update_permissions"),
  updateRolePermissions
);

export default router;  