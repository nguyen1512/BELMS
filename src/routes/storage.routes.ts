import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createResource,
  deleteResource,
  getResources,
  updateResourceStatus,
} from "../controllers/storage.controller";

const router = Router();

router.get("/resources", authMiddleware, getResources);
router.post("/resources", authMiddleware, createResource);
router.patch("/resources/:id/status", authMiddleware, updateResourceStatus);
router.delete("/resources/:id", authMiddleware, deleteResource);

export default router;