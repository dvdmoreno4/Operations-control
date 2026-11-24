// Semesters (H1 = January-June, H2 = July-December) for the semester KPI. Pure, shared by UI and API.

/** "2026-03" -> "2026-H1". */
export function semesterOf(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${year}-H${m <= 6 ? 1 : 2}`;
}

/** "2026-H2" -> ["2026-07", ..., "2026-12"]. */
export function monthsOf(semester: string): string[] {
  const [year, half] = semester.split('-H');
  const start = half === '1' ? 1 : 7;
  return Array.from({ length: 6 }, (_, i) => `${year}-${String(start + i).padStart(2, '0')}`);
}

/** "2026-H1" -> "Ene - Jun 2026". */
export function semesterLabel(semester: string): string {
  const [year, half] = semester.split('-H');
  return half === '1' ? `Ene - Jun ${year}` : `Jul - Dic ${year}`;
}

export const isSemester = (value: string) => /^\d{4}-H[12]$/.test(value);

/** Months of the semester already started by `today` (0-6): 6 for past semesters, 0 for future ones. */
export function elapsedMonths(semester: string, today = new Date().toISOString().slice(0, 7)): number {
  return monthsOf(semester).filter((m) => m <= today).length;
}

/** Distinct semesters of a list of months, newest first. */
export function semestersOf(months: string[]): string[] {
  return [...new Set(months.map(semesterOf))].sort().reverse();
}

/** Average of the values that exist, rounded to 1 decimal; null when none. */
export function average(values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => typeof v === 'number');
  return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10 : null;
}
