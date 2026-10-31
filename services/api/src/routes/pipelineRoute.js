import { Router } from "express";
import { getPipelineSymbol } from "../controllers/pipelineController.js";

const router = Router();

router.get("/:symbol", getPipelineSymbol);

export default router;