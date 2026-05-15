// bank.controller.js

import { verifyBankAccountService, addBankRecipientService } from "./bank.service.js";
import TravellerKYC from "../traveller/travellerKYC.model.js";
import { KYC_STATUS } from "../../utils/constants.js";

/**
 * Step 1: Verify bank account
 * POST /api/kyc/bank/verify
 */
export const verifyBankAccount = async (req, res) => {
  try {
    const { accountNumber, bankName, ifsc } = req.body;

    const result = await verifyBankAccountService({ accountNumber, bankName, ifsc });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("Bank verification error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Bank verification failed",
    });
  }
};

/**
 * Step 2: Add bank recipient details
 * POST /api/kyc/bank/recipient
 */
export const addBankRecipient = async (req, res) => {
  try {
    const { 
      accountNumber, 
      bankName, 
      ifsc, 
      recipientName, 
      mobileNumber,
      verificationId 
    } = req.body;

    const result = await addBankRecipientService({ 
      accountNumber, 
      bankName, 
      ifsc, 
      recipientName, 
      mobileNumber,
      verificationId 
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Update bank verification status in TravellerKYC
    // Note: This does NOT update the main KYC status (which is for PAN verification)
    // bank_verified is a separate field used for withdrawal eligibility
    await TravellerKYC.update(
      { 
        bank_verified: true,
        account_number: accountNumber,
        bank_name: bankName,
        ifsc: ifsc,
        account_holder: recipientName,
      },
      { where: { user_id: req.user.id } }
    );

    return res.json(result);
  } catch (error) {
    console.error("Bank recipient error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add bank recipient details",
    });
  }
};
