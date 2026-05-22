import express from "express";
import { getStudyTimeReport } from "../controllers/studyTimeReport.controller";

const router = express.Router();

router.get("/", getStudyTimeReport);

export default router;