import nodemailer from "nodemailer";

/** Strip accidental quotes / BOM — common when copying from .env examples. */
function trimQuotedEnv(raw) {
  return String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .trim();
}

/** Strip accidental quotes / BOM — common when copying from .env examples. */
export function sanitizeEmailUserForSmtp(raw) {
  return trimQuotedEnv(raw).toLowerCase();
}

/**
 * Gmail App Passwords must be contiguous 16 chars. Also strips pasted newlines
 * and spaced display format `xxxx xxxx xxxx xxxx`.
 */
export function normalizeSmtpPassword(raw) {
  return trimQuotedEnv(raw).replace(/\s+/g, "");
}

/**
 * Password env (first hit wins among non‑blank values): EMAIL_PASS · EMAIL_PASSWORD · GMAIL_APP_PASSWORD.
 * Gmail rejects normal account passwords — use an App Password (2‑Step Verification on).
 */
export function resolveSmtpPasswordFromEnv() {
  for (const key of ["EMAIL_PASS", "EMAIL_PASSWORD", "GMAIL_APP_PASSWORD"]) {
    const v = normalizeSmtpPassword(process.env[key] ?? "");
    if (v) return v;
  }
  return "";
}

/** `{ user, pass }` after sanitization — use everywhere we build Gmail SMTP auth. */
export function getGmailAuthFromEnv() {
  const user = sanitizeEmailUserForSmtp(process.env.EMAIL_USER ?? "");
  const pass = resolveSmtpPasswordFromEnv();
  return { user, pass };
}

/**
 * Resolved SMTP endpoint (explicit host/port). Defaults match Gmail STARTTLS on 587.
 * Override via EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_SECURE=true|false (optional).
 */
export function resolveSmtpConnectionFromEnv() {
  const rawHost = trimQuotedEnv(process.env.EMAIL_SMTP_HOST);
  const host = rawHost || "smtp.gmail.com";

  let port = Number.parseInt(trimQuotedEnv(process.env.EMAIL_SMTP_PORT), 10);
  if (!Number.isFinite(port) || port <= 0) port = 587;

  const secRaw = trimQuotedEnv(process.env.EMAIL_SMTP_SECURE).toLowerCase();
  let secure;
  if (secRaw === "true" || secRaw === "1") secure = true;
  else if (secRaw === "false" || secRaw === "0") secure = false;
  else secure = port === 465;

  return { host, port, secure };
}

export function maskSmtpSenderForLogs(user) {
  const u = String(user ?? "").trim();
  const at = u.indexOf("@");
  if (at < 1) return "***";
  const local = u.slice(0, at);
  const domain = u.slice(at + 1);
  const visible = Math.min(2, local.length);
  return `${local.slice(0, visible)}***@${domain}`;
}

/**
 * Formats the SMTP "From" address with an optional display name.
 * Reads EMAIL_FROM_NAME env var (e.g. "Shilp Group Appointments").
 * Returns `"Display Name" <user@gmail.com>` when a name is set, else just the email.
 */
export function getFromAddress(user) {
  const name = trimQuotedEnv(process.env.EMAIL_FROM_NAME ?? "").trim();
  if (name) {
    const safeName = name.replace(/"/g, "'");
    return `"${safeName}" <${user}>`;
  }
  return user;
}

function buildMailTransportOptions(user, pass) {
  const { host, port, secure } = resolveSmtpConnectionFromEnv();

  /** @type {import("nodemailer").TransportOptions} */
  const opts = {
    host,
    port,
    secure,
    auth: { user, pass },
  };

  // Gmail: STARTTLS on 587 (`secure: false`).
  if (!secure && port === 587) {
    opts.requireTLS = true;
  }

  return opts;
}

let cachedTransport;
let cachedKey;

/** Null when EMAIL_USER or any password env is missing. Recreates transport when credentials/settings change. */
export function getMailTransport() {
  const { user, pass } = getGmailAuthFromEnv();
  if (!user || !pass) {
    cachedTransport = undefined;
    cachedKey = undefined;
    return null;
  }
  const { host, port, secure } = resolveSmtpConnectionFromEnv();
  const sig = `${host}:${port}:${secure}:${user}:${pass}`;
  if (!cachedTransport || cachedKey !== sig) {
    cachedTransport = nodemailer.createTransport(buildMailTransportOptions(user, pass));
    cachedKey = sig;
  }
  return cachedTransport;
}

/**
 * Lightweight SMTP handshake; does not send mail.
 * Returns a plain object (never throws).
 */
export async function verifyMailTransport() {
  const transport = getMailTransport();
  if (!transport) {
    return {
      ok: false,
      code: "not_configured",
      message:
        "Set EMAIL_USER (Gmail address) and EMAIL_PASS (or GMAIL_APP_PASSWORD) with a 16-character App Password, then restart the server.",
    };
  }
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    const responseCode =
      typeof err?.responseCode === "number" ? err.responseCode : undefined;
    const rawCode =
      typeof err?.code === "string" && err.code ? err.code : "verify_failed";
    let message = typeof err?.message === "string" ? err.message : "SMTP verification failed.";
    if (responseCode === 535 || /535/i.test(message) || /badcredentials/i.test(message)) {
      message =
        "Gmail rejected the login (535). Use a Gmail App Password for this exact EMAIL_USER — normal passwords never work — or check Workspace SMTP policy.";
    }
    return { ok: false, code: rawCode, responseCode, message };
  }
}

/** JSON snapshot for admin “SMTP health” (no passwords). */
export async function getSmtpHealthSnapshot() {
  const settings = resolveSmtpConnectionFromEnv();
  const { user, pass } = getGmailAuthFromEnv();
  const configured = Boolean(user && pass);

  if (!configured) {
    return {
      configured: false,
      smtpOk: null,
      transport: settings,
      message:
        "Outbound mail is not configured. Set EMAIL_USER and EMAIL_PASS (App Password). See docs/GMAIL_SMTP.md.",
    };
  }

  const verification = await verifyMailTransport();

  /** @type {Record<string, unknown>} */
  const out = {
    configured: true,
    smtpOk: verification.ok,
    transport: settings,
    fromAddressMasked: maskSmtpSenderForLogs(user),
    message: verification.ok
      ? "SMTP connection verified with the current credentials."
      : verification.message,
  };

  if (!verification.ok && typeof verification.responseCode !== "undefined") {
    out.details = { code: verification.code, responseCode: verification.responseCode };
  } else if (!verification.ok && verification.code) {
    out.details = { code: verification.code };
  }

  return out;
}
