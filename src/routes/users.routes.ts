import { Router } from "express";

import { authMiddleware } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

import {
  createUser,
  getUsers,
  updateUser,
  updateUserStatus,
} from "../controllers/users.controller";

const router = Router();

router.get("/", authMiddleware, requirePermission("users.view"), getUsers);

router.post("/", authMiddleware, requirePermission("users.create"), createUser);

router.patch("/:id", authMiddleware, requirePermission("users.update"), updateUser);

router.patch(
  "/:id/status",
  authMiddleware,
  requirePermission("users.lock"),
  updateUserStatus
);

export default router;