// pan.mock.js

export const mockPanResponse = ({ panNumber, fullName, dob }) => {
  // simulate invalid PAN
  if (panNumber === "INVALID") {
    return {
      success: false,
      message: "Invalid PAN number",
    };
  }

  return {
    success: true,
    message: "PAN verified successfully (Mock)",
    data: {
      personal_info: {
        pan_number: panNumber,
        provided_name: fullName,
        registered_name: fullName.toUpperCase(),
        first_name: fullName.split(" ")[0],
        last_name: fullName.split(" ")[1] || "",
        gender: "Male",
        pan_type: "Individual",
        date_of_birth: dob,
      },
      contact_info: {
        full_address: "Flat 101, MG Road, Pune, Maharashtra, 411001",
      },
      kyc_status: {
        masked_aadhaar: "XXXX-XXXX-1234",
        aadhaar_linked: true,
        kyc_status: "Verified",
      },
    },
  };
};