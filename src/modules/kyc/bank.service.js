// bank.service.js

import axios from "axios";
import { mockBankVerificationResponse, mockBankRecipientResponse } from "./bank.mock.js";

const USE_REAL_API = false; // change to true later after getting paid API

/**
 * Step 1: Verify bank account
 * In production, this would call a bank verification API (like Razorpay Fund Account Validation)
 * and actually send ₹1 to the account
 */
export const verifyBankAccountService = async ({ accountNumber, bankName, ifsc }) => {
  if (!accountNumber || !bankName) {
    throw new Error("Account number and bank name are required");
  }

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!USE_REAL_API) {
    return mockBankVerificationResponse({ accountNumber, bankName, ifsc });
  }

  // 🔥 REAL API (Razorpay Fund Account Validation or similar)
  // This would actually send ₹1 to verify the account
  const response = await axios.post("BANK_VERIFICATION_API_URL", {
    account_number: accountNumber,
    ifsc: ifsc,
    name: bankName,
    amount: 100, // ₹1 in paise
  });

  return {
    success: true,
    message: "Bank account verified successfully. ₹1 has been credited to your account.",
    data: {
      id: response.data.id,
      account_number: accountNumber,
      bank_name: bankName,
      ifsc_code: ifsc || response.data.ifsc,
      account_holder_name: response.data.name_at_bank,
      verification_status: response.data.status,
      verification_amount: 1,
      verified_at: new Date().toISOString(),
    },
  };
};

/**
 * Step 2: Add recipient details
 * This saves the complete bank information with recipient details
 */
export const addBankRecipientService = async ({ 
  accountNumber, 
  bankName, 
  ifsc, 
  recipientName, 
  mobileNumber,
  verificationId 
}) => {
  if (!accountNumber || !bankName || !recipientName || !mobileNumber) {
    throw new Error("All fields are required");
  }

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (!USE_REAL_API) {
    return mockBankRecipientResponse({ 
      accountNumber, 
      bankName, 
      ifsc, 
      recipientName, 
      mobileNumber 
    });
  }

  // 🔥 REAL API - Save to payment gateway or database
  const response = await axios.post("BANK_RECIPIENT_API_URL", {
    account_number: accountNumber,
    ifsc: ifsc,
    bank_name: bankName,
    recipient_name: recipientName,
    mobile_number: mobileNumber,
    verification_id: verificationId,
  });

  return {
    success: true,
    message: "Bank recipient details added successfully",
    data: {
      id: response.data.id,
      account_number: accountNumber,
      bank_name: bankName,
      ifsc_code: ifsc,
      recipient_name: recipientName,
      mobile_number: mobileNumber,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
    },
  };
};
