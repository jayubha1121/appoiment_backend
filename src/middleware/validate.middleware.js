import { validationResult } from "express-validator";
import { AppError } from "../utils/app-error.js";

export function handleValidationErrors(req, _res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    throw new AppError("Validation error", 400, {
      errors: errors.array(),
    });
  }

  next();
}