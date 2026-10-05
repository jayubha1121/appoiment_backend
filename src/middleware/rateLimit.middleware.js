import rateLimit from "express-rate-limit";

// `validate: { xForwardedForHeader: false }` suppresses the ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// warning in environments where trust proxy is set at the app level (already done in server.js).
const sharedOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
};

export const publicApiRateLimit = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  limit: 300,
});

export const bookingRateLimit = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  limit: 60,
});