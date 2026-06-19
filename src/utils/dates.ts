const ARGENTINA_OFFSET = "-03:00";

export function toCalendarDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${ARGENTINA_OFFSET}`);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function isoTimestamp(date = new Date()): string {
  return date.toISOString();
}

export function nextFutureWeekday(base: Date, weekday: number): Date {
  const next = new Date(base);
  const diff = (weekday + 7 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + diff);
  return next;
}
