import TravellerKYC from "./travellerKYC.model.js";

/* =============================
   SUBMIT / UPDATE KYC
============================= */
export const submitKYC = async (userId, body, files) => {
  const payload = {
    ...body,
    user_id: userId,

    aadhar_front: files?.aadharFront?.[0]?.path,
    aadhar_back: files?.aadharBack?.[0]?.path,
    pan_front: files?.panFront?.[0]?.path,
    pan_back: files?.panBack?.[0]?.path,
    driving_photo: files?.drivingPhoto?.[0]?.path,
    selfie: files?.selfie?.[0]?.path,

    status: "PENDING"
  };

  const [kyc] = await TravellerKYC.upsert(payload, { returning: true });

  return kyc;
};


/* =============================
   GET MY KYC
============================= */
export const getMyKYC = async (userId) => {
  return await TravellerKYC.findOne({
    where: { user_id: userId }
  });
};



// update kyc 


/* =============================
   UPDATE KYC STATUS (ADMIN)
============================= */
export const updateKYCStatus = async (kycId, status) => {

  const kyc = await TravellerKYC.findByPk(kycId);

  if (!kyc) {
    throw new Error("KYC record not found");
  }

  const validStatuses = ["PENDING","APPROVED","REJECTED"];

  if (!validStatuses.includes(status)) {
    throw new Error("Invalid status value");
  }

  await kyc.update({ status });

  return kyc;
};
