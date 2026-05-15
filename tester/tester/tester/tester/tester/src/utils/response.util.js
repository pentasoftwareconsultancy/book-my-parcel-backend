
export function responseSuccess(res, data = {}, message = "Success", status = 200) {
  return res.status(status).json({
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
