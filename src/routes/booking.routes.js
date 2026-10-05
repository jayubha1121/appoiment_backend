import { Router } from "express";
import { bookingController } from "../controllers/booking.controller.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import {
  adminBookingIdParamValidator,
  appointmentsFilterValidator,
  createBookingValidator,
} from "../validators/booking.validator.js";
import { requirePermission } from "../middleware/auth.middleware.js";
import { PERMISSIONS } from "../utils/permissions.js";

export const bookingRouter = Router();
export const adminBookingRouter = Router();

bookingRouter.post(
  "/",
  createBookingValidator,
  validateRequest,
  (req, res) => bookingController.createBooking(req, res),
);

adminBookingRouter.get(
  "/",
  requirePermission(PERMISSIONS.APPOINTMENTS_VIEW),
  appointmentsFilterValidator,
  validateRequest,
  (req, res) => bookingController.getBookings(req, res),
);

adminBookingRouter.get(
  "/export",
  requirePermission(PERMISSIONS.APPOINTMENTS_EXPORT),
  appointmentsFilterValidator,
  validateRequest,
  (req, res) => bookingController.exportBookings(req, res),
);

adminBookingRouter.delete(
  "/:bookingId",
  requirePermission(PERMISSIONS.APPOINTMENTS_DELETE),
  adminBookingIdParamValidator,
  validateRequest,
  (req, res) => bookingController.deleteBooking(req, res),
);
