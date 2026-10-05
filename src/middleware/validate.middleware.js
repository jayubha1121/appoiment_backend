// FILE: src/middleware/validate.middleware.js
// ============================================
// CORRECTED VERSION - exports validateRequest (not handleValidationErrors)

import { validationResult } from "express-validator";
import { sendError } from "../utils/response.js";

export function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Strip the submitted `value` from each error — avoids leaking large/sensitive
    // user input back in the response and keeps the payload small.
    const details = errors.array().map(({ type, msg, path, location }) => ({
      type,
      msg,
      path,
      location,
    }));
    return sendError(res, "Validation failed", 400, details);
  }

  next();
}