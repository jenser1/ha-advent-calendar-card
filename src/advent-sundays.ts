/**
 * Welcher Adventssonntag der `day`. Dezember im Jahr `year` ist (1–4), sonst undefined.
 * Der 4. Advent ist der letzte Sonntag vor dem 25. Dezember – fällt Heiligabend auf
 * einen Sonntag, ist er selbst der 4. Advent. 2026: 6.12. = 2., 13.12. = 3., 20.12. = 4. Advent.
 */
export function adventSunday(year: number, day: number): number | undefined {
  if (!Number.isInteger(day) || day < 1 || day > 24) {
    return undefined;
  }
  // Wochentag von Heiligabend, 0 = Sonntag (UTC, damit die Zeitzone nichts verschiebt).
  const weekday = new Date(Date.UTC(year, 11, 24)).getUTCDay();
  const fourth = 24 - weekday;
  const distance = fourth - day;
  if (distance < 0 || distance % 7 !== 0) {
    return undefined;
  }
  const advent = 4 - distance / 7;
  return advent >= 1 ? advent : undefined;
}
