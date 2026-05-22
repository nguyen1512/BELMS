import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import {
  createDepartment,
  deleteDepartment,
  getDepartments,
  updateDepartment,
} from "../controllers/departments.controller";

const router = Router();

router.get("/", authMiddleware, requirePermission("departments.view"), getDepartments);

router.post("/", authMiddleware, requirePermission("departments.create"), createDepartment);

router.patch("/:id", authMiddleware, requirePermission("departments.update"), updateDepartment);

router.delete("/:id", authMiddleware, requirePermission("departments.delete"), deleteDepartment);

export default router;