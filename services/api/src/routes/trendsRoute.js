import { Router } from "express";
import { getMonthlyTrends } from "../controllers/trendsController.js";

const router = Router();

router.get("/monthly", getMonthlyTrends);

export default router;