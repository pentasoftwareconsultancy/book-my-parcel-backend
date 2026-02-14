
// validation for the    kyc submit

export const validateKYC = (req, res, next) => {
  const {
    first_name,
    last_name,
    dob,
    gender,
    aadhar_number,
    pan_number
  } = req.body;

  const errors = [];

  if (!first_name) errors.push("First name required");
  if (!last_name) errors.push("Last name required");
  if (!dob) errors.push("DOB required");

  if (!aadhar_number || !/^\d{12}$/.test(aadhar_number))
    errors.push("Valid Aadhar required");

  if (!pan_number || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan_number))
    errors.push("Valid PAN required");

  if (errors.length > 0)
    return res.status(400).json({ errors });

  next();
};


// validation for the    kyc update 

export const validateStatus = (req, res, next) => {
  const { status } = req.body;

  const allowed = ["PENDING", "APPROVED", "REJECTED"];

  if (!status || !allowed.includes(status))
    return res.status(400).json({ error: "Invalid status value" });

  next();
};
