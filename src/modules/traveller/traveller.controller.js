import * as travellerService from "./traveller.service.js";

/* SUBMIT KYC */
export const submitKYC = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const data = await travellerService.submitKYC(
      userId,
      req.body,
      req.files
    );

    res.status(200).json({
  success: true,
  message: "KYC Submitted",
  data
});

  } catch (err) {
    next(err);
  }
};


/* GET MY KYC */
export const getMyKYC = async (req, res, next) => {
  try {
    const data = await travellerService.getMyKYC(req.user.id);
    res.status(200).json({
  success: true,
  data
});

  } catch (err) {
    next(err);
  }
};


// update 
/* UPDATE KYC STATUS */
export const updateKYCStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const data = await travellerService.updateKYCStatus(id, status);

    res.status(200).json({
      success: true,
      message: "KYC status updated",
      data
    });

  } catch (err) {
    next(err);
  }
};
