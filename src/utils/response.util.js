
export function responseSuccess(res, message = "Success", data = {}) {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
}

export function responseError(res, message = "Error", status = 500) {
  return res.status(status).json({
    success: false,
    message,
  });
}
