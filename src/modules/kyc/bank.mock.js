// bank.mock.js

export const mockBankVerificationResponse = ({ accountNumber, bankName, ifsc }) => {
  return {
    success: true,
    message: "Bank account verified successfully. ₹1 has been credited to your account.",
    data: {
      id: `BANK_VER_${Date.now()}`,
      account_number: accountNumber,
      bank_name: bankName,
      ifsc_code: ifsc || "AUTO_DETECTED",
      account_holder_name: "Account Holder", // This would come from bank API
      verification_status: "VERIFIED",
      verification_amount: 1,
      verified_at: new Date().toISOString(),
    },
  };
};

export const mockBankRecipientResponse = ({ 
  accountNumber, 
  bankName, 
  ifsc, 
  recipientName, 
  mobileNumber 
}) => {
  return {
    success: true,
    message: "Bank recipient details added successfully",
    data: {
      id: `BANK_REC_${Date.now()}`,
      account_number: accountNumber,
      bank_name: bankName,
      ifsc_code: ifsc || "AUTO_DETECTED",
      recipient_name: recipientName,
      mobile_number: mobileNumber,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      bank_info: {
        account_number: accountNumber,
        bank_name: bankName,
        ifsc_code: ifsc || "AUTO_DETECTED",
        verification_status: "VERIFIED",
        verification_amount: 1,
      },
    },
  };
};
