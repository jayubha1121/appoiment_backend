import { body, param, query } from "express-validator";

export const adminBookingIdParamValidator = [
  param("bookingId").isMongoId().withMessage("Invalid booking id"),
];

export const SLOT_DURATIONS = [10, 15, 30, 45, 60];
export const APPOINTMENT_PAGE_SIZES = [10, 20, 50, 100, 500];

export const createBookingValidator = [
  body("slotId").isMongoId(),
  body("formId").isMongoId(),
  body("name").isString().trim().isLength({ min: 2, max: 120 }),
  body("phone").isString().trim().isLength({ min: 5, max: 30 }),
  body("address")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 500 }),
  body("email").isEmail().normalizeEmail(),
  body("inquiryType").isString().trim().isLength({ min: 1, max: 120 }),
  body("extraFields").optional().isObject(),
  body("extraFields.*").optional().isString().trim().isLength({ min: 0, max: 500 }),
];

export const formIdParamValidator = [param("formId").isMongoId()];

export const createFormValidator = [
  body("title").isString().trim().isLength({ min: 2, max: 120 }).withMessage("Title must be between 2 and 120 characters"),
  body("description").optional().isString().trim(),
  body("customFields").optional().isArray({ max: 25 }),
  body("customFields.*.key")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .withMessage("customFields keys must be alphanumeric/underscore and start with a letter"),
  body("customFields.*.label")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 80 }),
  body("customFields.*.required").optional().isBoolean(),
  body("excludedSlotTimes")
    .optional()
    .isArray({ max: 200 })
    .withMessage("excludedSlotTimes must be an array"),
  body("excludedSlotTimes.*")
    .optional()
    .isString()
    .matches(/^\d{2}:\d{2}$/)
    .withMessage("Each excludedSlotTime must be in HH:MM format"),
  body("activeFrom").isISO8601(),
  body("activeTo").isISO8601(),
  body("activeWeekdays")
    .isArray({ min: 1 })
    .withMessage("activeWeekdays must be a non-empty array"),
  body("activeWeekdays.*")
    .isInt({ min: 0, max: 6 })
    .withMessage("activeWeekdays entries must be 0-6"),
  body("startHour").optional().isFloat({ min: 0, max: 22.5 }),
  body("endHour").optional().isFloat({ min: 0.5, max: 23 }),
  body("slotDuration").isInt().custom((value) => {
    if (!SLOT_DURATIONS.includes(Number(value))) {
      throw new Error(
        `slotDuration must be one of ${SLOT_DURATIONS.join(", ")}`,
      );
    }
    return true;
  }),
  body("slotCapacity").isInt({ min: 1, max: 1000 }),
  body("inquiryTypes")
    .optional()
    .isArray({ min: 1 })
    .withMessage("inquiryTypes must be a non-empty array"),
  body("inquiryTypes.*").optional().isString().trim().notEmpty(),
  body("inquiryAllowCustom").optional().isBoolean(),
  body("bookingLinkExpiresDate")
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("bookingLinkExpiresDate must be YYYY-MM-DD"),
  body("bookingLinkExpiresTime")
    .isString()
    .trim()
    .custom((v) => {
      const s = String(v).trim().slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(s)) {
        throw new Error("bookingLinkExpiresTime must be HH:MM");
      }
      return true;
    }),
  body("bookingLinkExpiresTimeZone")
    .isString()
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage("bookingLinkExpiresTimeZone must be a valid IANA name from the client"),
  body("isActive").optional().isBoolean(),
  body("whatsappTemplateName")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 80 })
    .withMessage("whatsappTemplateName must be a string of max 80 characters"),
  body("whatsappPhones").optional().isArray({ max: 20 }),
  body("whatsappPhones.*")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 20 })
    .withMessage("Each whatsappPhones entry must be a non-empty phone string"),
  body("emailRecipients").optional().isArray({ max: 40 }).withMessage("emailRecipients must be an array of max 40"),
  body("emailRecipients.*").optional().isEmail().normalizeEmail().withMessage("Each emailRecipients entry must be a valid email"),
  body().custom((value) => {
    const start = Number(value.startHour ?? 10);
    const end = Number(value.endHour ?? 19);
    if (end <= start) {
      throw new Error("endHour must be greater than startHour");
    }
    const activeFrom = new Date(value.activeFrom);
    const activeTo = new Date(value.activeTo);
    if (Number.isNaN(activeFrom.getTime()) || Number.isNaN(activeTo.getTime())) {
      throw new Error("activeFrom and activeTo must be valid ISO dates");
    }
    if (activeTo < activeFrom) {
      throw new Error("activeTo must be on or after activeFrom");
    }
    const days = Math.ceil(
      (activeTo.getTime() - activeFrom.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (days > 180) {
      throw new Error("Date range is too large (max 180 days)");
    }
    return true;
  }),
];

export const updateFormValidator = [
  param("formId").isMongoId(),
  body("title").optional().isString().trim().isLength({ min: 2, max: 120 }).withMessage("Title must be between 2 and 120 characters"),
  body("description").optional().isString().trim(),
  body("isActive").optional().isBoolean(),
  body("inquiryTypes").optional().isArray({ min: 1 }),
  body("inquiryTypes.*").optional().isString().trim().notEmpty(),
  body("inquiryAllowCustom").optional().isBoolean(),
  body("customFields").optional().isArray({ max: 25 }),
  body("customFields.*.key")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  body("customFields.*.label")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 80 }),
  body("customFields.*.required").optional().isBoolean(),
  body("activeFrom").optional().isISO8601(),
  body("activeTo").optional().isISO8601(),
  body("activeWeekdays").optional().isArray({ min: 1 }),
  body("activeWeekdays.*").optional().isInt({ min: 0, max: 6 }),
  body("bookingLinkExpiresAt").optional().isISO8601(),
  body("businessTimeZone")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage("businessTimeZone must be a valid IANA timezone name"),
  body("whatsappTemplateName")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 80 })
    .withMessage("whatsappTemplateName must be a string of max 80 characters"),
  body("whatsappPhones").optional().isArray({ max: 20 }),
  body("whatsappPhones.*")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 20 })
    .withMessage("Each whatsappPhones entry must be a non-empty phone string"),
  body("emailRecipients").optional().isArray({ max: 40 }).withMessage("emailRecipients must be an array of max 40"),
  body("emailRecipients.*").optional().isEmail().normalizeEmail().withMessage("Each emailRecipients entry must be a valid email"),
  body().custom((value) => {
    if (!value.activeFrom && !value.activeTo) return true;
    const activeFrom = value.activeFrom ? new Date(value.activeFrom) : null;
    const activeTo = value.activeTo ? new Date(value.activeTo) : null;
    if (activeFrom && Number.isNaN(activeFrom.getTime())) {
      throw new Error("activeFrom must be a valid ISO date");
    }
    if (activeTo && Number.isNaN(activeTo.getTime())) {
      throw new Error("activeTo must be a valid ISO date");
    }
    if (activeFrom && activeTo && activeTo < activeFrom) {
      throw new Error("activeTo must be on or after activeFrom");
    }
    return true;
  }),
];

export const visitsQueryValidator = [
  query("range").optional().isIn(["7d", "30d", "custom"]),
  query("startDate").optional().isISO8601(),
  query("endDate").optional().isISO8601(),
];

export const appointmentsFilterValidator = [
  query("formId").optional().isMongoId(),
  query("slotId").optional().isMongoId(),
  query("inquiryType").optional().isString().trim(),
  query("search").optional().isString().trim().isLength({ max: 120 }),
  query("startDate").optional().isISO8601(),
  query("endDate").optional().isISO8601(),
  query("page").optional().isInt({ min: 1 }),
  query("limit")
    .optional()
    .isInt()
    .custom((value) => {
      if (!APPOINTMENT_PAGE_SIZES.includes(Number(value))) {
        throw new Error(
          `limit must be one of ${APPOINTMENT_PAGE_SIZES.join(", ")}`,
        );
      }
      return true;
    }),
];
