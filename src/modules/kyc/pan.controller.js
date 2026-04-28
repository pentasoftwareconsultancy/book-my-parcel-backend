// pan.controller.js

import { verifyPanService } from "./pan.service.js";

export const verifyPan = async (req, res) => {
  try {
    const result = await verifyPanService(req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};