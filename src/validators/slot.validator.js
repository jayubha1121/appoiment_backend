import { param, query } from "express-validator";

export const slotIdParamValidator = [param("slotId").isMongoId()];
export const formIdParamValidator = [param("formId").isMongoId()];

export const slotDateQueryValidator = [
  query("date")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("date must be YYYY-MM-DD"),
];
