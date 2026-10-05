function minutesToHHMM(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function buildDailySlotWindows({
  startHour,
  endHour,
  slotDuration,
}) {
  const windows = [];
  const totalMinutes = (endHour - startHour) * 60;

  for (
    let offset = 0;
    offset + slotDuration <= totalMinutes;
    offset += slotDuration
  ) {
    const startMinutes = startHour * 60 + offset;
    const endMinutes = startMinutes + slotDuration;

    windows.push({
      startTime: minutesToHHMM(startMinutes),
      endTime: minutesToHHMM(endMinutes),
    });
  }

  return windows;
}

export function buildSlotDocs({
  formId,
  date,
  startHour,
  endHour,
  slotDuration,
  slotCapacity,
  excludedSlotTimes = [],
}) {
  const excluded = new Set(Array.isArray(excludedSlotTimes) ? excludedSlotTimes.map(String) : []);
  return buildDailySlotWindows({ startHour, endHour, slotDuration })
    .filter((window) => !excluded.has(window.startTime))
    .map((window) => ({
      formId,
      date: new Date(date),
      startTime: window.startTime,
      endTime: window.endTime,
      capacity: slotCapacity,
      bookedCount: 0,
      isActive: true,
    }));
}

function toUtcStartOfDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function buildSlotDocsForRange({
  formId,
  activeFrom,
  activeTo,
  activeWeekdays,
  startHour,
  endHour,
  slotDuration,
  slotCapacity,
  excludedSlotTimes = [],
}) {
  const start = toUtcStartOfDay(activeFrom);
  const end = toUtcStartOfDay(activeTo);
  const weekdays = new Set((activeWeekdays ?? []).map((d) => Number(d)));

  const docs = [];
  for (let current = start; current <= end; current = addUtcDays(current, 1)) {
    const day = current.getUTCDay();
    if (!weekdays.has(day)) continue;
    docs.push(
      ...buildSlotDocs({
        formId,
        date: current,
        startHour,
        endHour,
        slotDuration,
        slotCapacity,
        excludedSlotTimes,
      }),
    );
  }
  return docs;
}
