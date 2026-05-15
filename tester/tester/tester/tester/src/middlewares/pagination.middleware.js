const paginationMiddleware = (req, res, next) => {
  let { page = 1, limit = 10 } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  if (isNaN(page) || page <= 0) {
    return res.status(400).json({
      success: false,
      message: "Page must be a positive number"
    });
  }

  if (isNaN(limit) || limit <= 0) {
    return res.status(400).json({
      success: false,
      message: "Limit must be a positive number"
    });
  }

  if (limit > 100) {
    return res.status(400).json({
      success: false,
      message: "Limit cannot exceed 100"
    });
  }

  const offset = (page - 1) * limit;

  req.pagination = {
    page,
    limit,
    offset
  };

  next();
};

export default paginationMiddleware;