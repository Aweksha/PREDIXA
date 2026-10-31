import { Router } from "express";
import { getEodHistory } from "../controllers/historyController.js";

const router = Router();

router.get("/eod", getEodHistory);

export default router;