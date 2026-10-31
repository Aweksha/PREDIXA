import { Router } from "express";
import { getEodHistory } from "../controllers/historyController.js";

const router = Router();

// Keep /api/real-data/eod as a compatibility alias for the AI training pipeline.
// It now uses the same DB-backed history controller as /api/history/eod so the
// trainer can request large windows (for example 1200 rows) instead of the old
// one-month/mock-data fallback path.
router.get("/eod", getEodHistory);

export default router;
