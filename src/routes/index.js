import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { bookingRateLimit } from "../middleware/rateLimit.middleware.js";
import { analyticsRouter } from "./analytics.routes.js";
import { adminBookingRouter, bookingRouter } from "./booking.routes.js";
import { adminFormRouter, publicFormRouter } from "./form.routes.js";
import { authRouter } from "./auth.routes.js";
import { adminSlotRouter, publicSlotRouter } from "./slot.routes.js";
import {
  adminIntegrationRouter,
  publicIntegrationRouter,
} from "./integration.routes.js";
import { adminReportsRouter } from "./reports.routes.js";
import { adminUserRouter } from "./user.routes.js";

export const apiRouter = Router();
export { authRouter };

// =========================
// PUBLIC ROUTES
// =========================

apiRouter.use("/forms", publicFormRouter);
apiRouter.use("/forms", publicSlotRouter);
apiRouter.use("/bookings", bookingRateLimit, bookingRouter);
apiRouter.use("/integrations", publicIntegrationRouter);

// =========================
// ADMIN ROUTES (all guarded by requireAuth middleware)
// =========================

apiRouter.use("/admin/forms", requireAuth, adminFormRouter);
apiRouter.use("/admin/appointments", requireAuth, adminBookingRouter);
apiRouter.use("/admin/analytics", requireAuth, analyticsRouter);
apiRouter.use("/admin/integrations", requireAuth, adminIntegrationRouter);
apiRouter.use("/admin/slots", requireAuth, adminSlotRouter);
apiRouter.use("/admin/reports", requireAuth, adminReportsRouter);
apiRouter.use("/admin/users", requireAuth, adminUserRouter);
