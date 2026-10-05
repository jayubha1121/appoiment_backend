import { body, param } from "express-validator";
import { ALL_PERMISSIONS } from "../utils/permissions.js";

export const userIdParamValidator = [
  param("userId").isMongoId().withMessage("Invalid user id"),
];

export const createUserValidator = [
  body("name").trim().isString().isLength({ min: 2, max: 120 }).withMessage("Name must be between 2 and 120 characters"),
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").trim().isString().isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").optional().isIn(["admin", "employee"]).withMessage("role must be admin or employee"),
  body("isActive").optional().isBoolean(),
  body("permissions").optional().isArray({ max: ALL_PERMISSIONS.length }).withMessage("permissions must be an array"),
  body("permissions.*").optional().isIn(ALL_PERMISSIONS).withMessage("Invalid permission supplied"),
];

export const updateUserValidator = [
  body("name").optional().trim().isString().isLength({ min: 2, max: 120 }).withMessage("Name must be between 2 and 120 characters"),
  body("email").optional().trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("role").optional().isIn(["admin", "employee"]).withMessage("role must be admin or employee"),
  body("isActive").optional().isBoolean(),
  body("permissions").optional().isArray({ max: ALL_PERMISSIONS.length }).withMessage("permissions must be an array"),
  body("permissions.*").optional().isIn(ALL_PERMISSIONS).withMessage("Invalid permission supplied"),
];

export const resetUserPasswordValidator = [
  body("password").trim().isString().isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
];