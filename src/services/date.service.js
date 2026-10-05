export function subDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
}
