import TravellerKYC from "./travellerKYC.model.js";
import { KYC_STATUS } from "../../middlewares/role.middleware.js";

/* SUBMIT / UPDATE KYC */
export const submitKYC = async (userId, body, files) => {

  delete body.status; // prevent manual status override

  const payload = {
    user_id: userId,
    ...body,

    aadhar_front: files?.aadharFront?.[0]?.path,
    aadhar_back: files?.aadharBack?.[0]?.path,
    pan_front: files?.panFront?.[0]?.path,
    pan_back: files?.panBack?.[0]?.path,
    driving_photo: files?.drivingPhoto?.[0]?.path,
    selfie: files?.selfie?.[0]?.path,

    status: KYC_STATUS.PENDING
  };

  const existing = await TravellerKYC.findOne({
    where: { user_id: userId }
  });

  if (existing) {

    if (existing.status === KYC_STATUS.APPROVED) {
      throw new Error("Approved KYC cannot be modified");
    }

    await existing.update(payload);
    return existing;
  }

  return await TravellerKYC.create(payload);
};


/* GET MY KYC */
export const getMyKYC = async (userId) => {
  return await TravellerKYC.findOne({
    where: { user_id: userId }
  });
};


/* UPDATE STATUS (ADMIN ONLY — controller already checks role) */
export const updateKYCStatus = async (kycId, status) => {

  const kyc = await TravellerKYC.findByPk(kycId);

  if (!kyc) {
    throw new Error("KYC record not found");
  }

  const validStatuses = Object.values(KYC_STATUS);

  if (!validStatuses.includes(status)) {
    throw new Error("Invalid status value");
  }

  await kyc.update({ status });

  return kyc;
};
