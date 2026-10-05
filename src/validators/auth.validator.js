import { body } from "express-validator";

export const registerValidator = [
  body("name")
    .optional()
    .trim()
    .isString()
    .isLength({ min: 2, max: 120 })
    .withMessage("Name must be between 2 and 120 characters"),
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
  body("password")
    .trim()
    .isString()
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

export const loginValidator = [
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
  body("password")
    .trim()
    .isString()
    .isLength({ min: 3 })
    .withMessage("Password is required"),
];

export const forgotPasswordValidator = [
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
];

export const verifyOtpValidator = [
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
  body("otp")
    .trim()
    .isString()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits"),
];

export const resetPasswordValidator = [
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
  body("otp")
    .trim()
    .isString()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits"),
  body("password")
    .trim()
    .isString()
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

export const changePasswordValidator = [
  body("currentPassword")
    .trim()
    .isString()
    .isLength({ min: 1 })
    .withMessage("Current password is required"),
  body("newPassword")
    .trim()
    .isString()
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
];
