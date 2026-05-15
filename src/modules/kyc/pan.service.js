// pan.service.js

import axios from "axios";
import { mockPanResponse } from "./pan.mock.js";

const USE_REAL_API = false; // change to true later after getting paid API

export const verifyPanService = async ({ panNumber, fullName, dob }) => {
  if (!panNumber || !fullName || !dob) {
    throw new Error("All fields are required");
  }

  // simulate delay (like real API)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (!USE_REAL_API) {
    return mockPanResponse({ panNumber, fullName, dob });
  }

  // 🔥 REAL API (replace later)
  const response = await axios.post("THIRD_PARTY_URL", {
    pan: panNumber,
    name: fullName,
    dob: dob,
  });

  // 🔥 IMPORTANT: map to SAME FORMAT
  return {
    success: true,
    message: "PAN verified successfully",
    data: {
      personal_info: {
        pan_number: response.data.pan,
        provided_name: fullName,
        registered_name: response.data.registered_name,
        first_name: response.data.first_name,
        last_name: response.data.last_name,
        gender: response.data.gender,
        pan_type: response.data.pan_type,
        date_of_birth: response.data.dob,
      },
      contact_info: {
        full_address: response.data.address,
      },
      kyc_status: {
        masked_aadhaar: response.data.masked_aadhaar,
        aadhaar_linked: response.data.aadhaar_linked,
        kyc_status: response.data.kyc_status,
      },
    },
  };
};