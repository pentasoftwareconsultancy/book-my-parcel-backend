// kyc.routes.js

import express from "express";
import { verifyPan } from "./pan.controller.js";

const router = express.Router();

router.post("/pan", verifyPan);

export default router;
