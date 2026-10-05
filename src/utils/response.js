export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function sendError(res, message, statusCode = 400, details) {
  return res.status(statusCode).json({ success: false, message, details });
}
