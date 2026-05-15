// pan.controller.js

import { verifyPanService } from "./pan.service.js";
import TravellerKYC from "../traveller/travellerKYC.model.js";
import { KYC_STATUS } from "../../utils/constants.js";

export const verifyPan = async (req, res) => {
  try {
    const result = await verifyPanService(req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Mark KYC as APPROVED immediately after successful PAN verification
    await TravellerKYC.update(
      { status: KYC_STATUS.APPROVED },
      { where: { user_id: req.user.id } }
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};