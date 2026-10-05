import jwt from "jsonwebtoken";
import { googleCalendarService } from "../services/google-calendar.service.js";
import {
  getManualCronRecipientEmails,
  setManualCronRecipientEmails,
} from "../services/cron-manual-recipients.service.js";
import { sendSuccess } from "../utils/response.js";
import { AppError } from "../utils/app-error.js";
import { getJwtSecret } from "../utils/auth.js";

export class IntegrationController {
  async listGoogleIntegrations(_req, res) {
    const data = await googleCalendarService.listIntegrations();
    return sendSuccess(res, data);
  }

  async createGoogleAuthUrl(req, res) {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!token) throw new AppError("Unauthorized", 401);

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      throw new AppError("Unauthorized", 401);
    }

    const stateJwt = jwt.sign(
      { sub: "google-oauth", admin: payload?.email ?? "admin", ts: Date.now() },
      getJwtSecret(),
      { expiresIn: "10m" },
    );

    const url = googleCalendarService.createAuthUrl(stateJwt);
    return sendSuccess(res, { url });
  }

  async googleCallback(req, res) {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");

    if (!code || !state) {
      throw new AppError("Missing OAuth parameters.", 400);
    }

    try {
      jwt.verify(state, getJwtSecret());
    } catch {
      throw new AppError("Invalid OAuth state.", 400);
    }

    await googleCalendarService.handleCallback({ code });

    const frontendUrl = String(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
    return res.redirect(`${frontendUrl}/dashboard/integrations?connected=1`);
  }

  async disconnectGoogle(req, res) {
    const data = await googleCalendarService.disconnect(String(req.params.id));
    return sendSuccess(res, data);
  }

  async listGoogleCalendars(req, res) {
    const data = await googleCalendarService.listCalendars(String(req.params.id));
    return sendSuccess(res, data);
  }

  async updateGoogleCalendar(req, res) {
    const data = await googleCalendarService.updateCalendar(
      String(req.params.id),
      String(req.body.calendarId),
    );
    return sendSuccess(res, data);
  }

  /** GET manual cron recipients (scheduled digest + expiry mail). */
  async getCronRecipients(_req, res) {
    const emails = await getManualCronRecipientEmails();
    return sendSuccess(res, { emails });
  }

  /** PUT replace manual cron recipients (validated, deduped, max 40). */
  async putCronRecipients(req, res) {
    const list = req.body?.emails;
    if (!Array.isArray(list)) {
      throw new AppError("Body must include emails: string[]", 400);
    }
    const emails = await setManualCronRecipientEmails(list);
    return sendSuccess(res, { emails });
  }
}

export const integrationController = new IntegrationController();

