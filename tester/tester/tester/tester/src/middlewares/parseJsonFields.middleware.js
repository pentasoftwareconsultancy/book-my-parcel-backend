const parseJsonFields = (fields) => (req, res, next) => {
  try {
    fields.forEach((field) => {
      if (req.body[field]) {
        req.body[field] = JSON.parse(req.body[field]);
      }
    });
    next();
  } catch (err) {
    console.error("JSON Parse Error:", err);
    res.status(400).json({
      success: false,
      message: "Invalid JSON format",
    });
  }
};

export default parseJsonFields;