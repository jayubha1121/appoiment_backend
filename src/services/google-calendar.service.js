import { google } from "googleapis";
import { AppError } from "../utils/app-error.js";
import { IntegrationModel } from "../models/Integration.js";

function getGoogleConfig() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI ?? "").trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError("Google Calendar integration is not configured.", 500);
  }

  return { clientId, clientSecret, redirectUri };
}

function buildOauthClient() {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export class GoogleCalendarService {
  createAuthUrl(stateJwt) {
    const oauth2 = buildOauthClient();

    return oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state: stateJwt,
    });
  }

  async handleCallback({ code }) {
    const oauth2 = buildOauthClient();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const me = await oauth2Api.userinfo.get();
    const email = String(me.data.email ?? "").trim().toLowerCase();
    if (!email) {
      throw new AppError("Could not read Google account email.", 400);
    }

    const refreshToken = String(tokens.refresh_token ?? "");
    const accessToken = String(tokens.access_token ?? "");
    const expiryDate = Number(tokens.expiry_date ?? 0);

    // If account was previously connected, Google may not resend refresh_token.
    const existing = await IntegrationModel.findOne({
      provider: "google",
      email,
    }).lean();

    const saved = await IntegrationModel.findOneAndUpdate(
      { provider: "google", email },
      {
        provider: "google",
        email,
        accessToken,
        expiryDate,
        isActive: true,
        ...(refreshToken ? { refreshToken } : {}),
        calendarId: existing?.calendarId ?? "primary",
      },
      { upsert: true, returnDocument: "after" },
    ).lean();

    return saved;
  }

  async listIntegrations() {
    return IntegrationModel.find({ provider: "google", isActive: true })
      .sort({ createdAt: -1 })
      .lean();
  }

  async disconnect(id) {
    const integration = await IntegrationModel.findByIdAndUpdate(
      id,
      { isActive: false, accessToken: "", expiryDate: 0 },
      { returnDocument: "after" },
    ).lean();
    if (!integration) throw new AppError("Integration not found", 404);
    return integration;
  }

  async updateCalendar(id, calendarId) {
    const integration = await IntegrationModel.findByIdAndUpdate(
      id,
      { calendarId: String(calendarId ?? "primary") },
      { returnDocument: "after" },
    ).lean();
    if (!integration) throw new AppError("Integration not found", 404);
    return integration;
  }

  async listCalendars(id) {
    const integration = await IntegrationModel.findById(id).lean();
    if (!integration) throw new AppError("Integration not found", 404);
    if (!integration.refreshToken) {
      throw new AppError("Google refresh token missing. Reconnect account.", 400);
    }

    const oauth2 = buildOauthClient();
    oauth2.setCredentials({
      refresh_token: integration.refreshToken,
      access_token: integration.accessToken || undefined,
      expiry_date: integration.expiryDate || undefined,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2 });
    const list = await calendar.calendarList.list({ maxResults: 250 });

    return (list.data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: Boolean(c.primary),
      accessRole: c.accessRole,
    }));
  }

  async createEventForBooking({
    integration,
    title,
    description,
    startIso,
    endIso,
    timezone = "Asia/Kolkata",
  }) {
    if (!integration.isActive) return;
    if (!integration.refreshToken) return;

    const oauth2 = buildOauthClient();
    oauth2.setCredentials({
      refresh_token: integration.refreshToken,
      access_token: integration.accessToken || undefined,
      expiry_date: integration.expiryDate || undefined,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2 });
    await calendar.events.insert({
      calendarId: integration.calendarId || "primary",
      requestBody: {
        summary: title,
        description,
        // Pass the timezone explicitly so Google Calendar interprets the
        // times as local time in that zone (not UTC), fixing the 5:30h offset.
        start: { dateTime: startIso, timeZone: timezone },
        end: { dateTime: endIso, timeZone: timezone },
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 30 }],
        },
      },
    });
  }
}

export const googleCalendarService = new GoogleCalendarService();

