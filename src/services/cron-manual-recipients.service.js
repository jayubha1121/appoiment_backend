import { CronManualRecipientSettingModel } from "../models/CronManualRecipientSetting.js";

const SINGLETON_KEY = "default";
const MAX_EMAILS = 40;

function isPlausibleEmail(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t.length < 5 || t.length > 254) return null;
  // Practical check; SMTP still validates deliverability.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeManualRecipientList(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const e = isPlausibleEmail(item);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= MAX_EMAILS) break;
  }
  return out;
}

export async function getManualCronRecipientEmails() {
  const doc = await CronManualRecipientSettingModel.findOne({
    singletonKey: SINGLETON_KEY,
  })
    .select("emails")
    .lean();

  if (!doc?.emails?.length) return [];

  const seen = new Set();
  const list = [];
  for (const x of doc.emails) {
    const e = isPlausibleEmail(x);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    list.push(e);
  }
  return list;
}

/**
 * Replace stored list; returns normalized array saved.
 * @param {unknown} rawList
 */
export async function setManualCronRecipientEmails(rawList) {
  const emails = normalizeManualRecipientList(rawList);
  await CronManualRecipientSettingModel.findOneAndUpdate(
    { singletonKey: SINGLETON_KEY },
    { $set: { emails } },
    { upsert: true, new: true },
  );
  return emails;
}
