// Data of the printable KPI report, for everyone, a department or one member. Pure functions.

import { DEPARTMENT_KEYS, DEPARTMENTS, type DepartmentKey } from './floorplan';
import { centralScore, compliance, memberDepartment, SCORE_SEGMENTS, totalScore, type Member } from './kpis';
import { average, isSemester, monthsOf, semesterLabel, semesterOf } from './semester';
import { aggregateByMember, type MemberRecord } from './stats';

export type ReportPerson = {
  member: Member;
  department: DepartmentKey | null;
  record: MemberRecord | undefined;
  total: number | null;
  central: number | null;
};

export type ReportData = {
  /** "mensual" for YYYY-MM, "semestral" for YYYY-H1/H2. */
  mode: 'mensual' | 'semestral';
  period: string;
  periodLabel: string;
  semester: string;
  people: ReportPerson[];
  summary: {
    members: number;
    reporting: number;
    avgTotal: number | null;
    avgCentral: number | null;
    avgSegments: { key: string; label: string; color: string; value: number | null }[];
    avgExtra: number | null;
    avgCollab: number | null;
    pnl: number;
    volume: number;
    operations: number;
    compliance: number | null;
    errors: number;
    incidents: number;
  };
  /** Average total score per month of the semester (members in scope with a record). */
  trend: { month: string; avg: number | null; reporting: number }[];
  /** Average total score per department (only meaningful for the whole organisation). */
  byDepartment: { key: DepartmentKey; label: string; color: string; avg: number | null; members: number }[];
};

const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * @param records every member's KPI records of the semester that contains `period`.
 * @param inScope which members the report covers.
 */
export function buildReport(members: Member[], records: MemberRecord[], period: string, inScope: (m: Member) => boolean): ReportData {
  const mode = isSemester(period) ? 'semestral' : 'mensual';
  const semester = mode === 'semestral' ? period : semesterOf(period);
  const scoped = members.filter(inScope);
  const ids = new Set(scoped.map((m) => m.id));
  const own = records.filter((r) => ids.has(r.memberId));

  const periodRecords = mode === 'semestral' ? aggregateByMember(own) : own.filter((r) => r.period === period);
  const byMember = new Map(periodRecords.map((r) => [r.memberId, r]));

  const people: ReportPerson[] = scoped
    .map((member) => {
      const record = byMember.get(member.id);
      return { member, department: memberDepartment(member), record, total: record ? totalScore(record) : null, central: record ? centralScore(record) : null };
    })
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.member.name.localeCompare(b.member.name));

  const withRecord = people.filter((p): p is ReportPerson & { record: MemberRecord } => p.record !== undefined);
  const sum = (pick: (r: MemberRecord) => number) => withRecord.reduce((s, p) => s + pick(p.record), 0);
  const goal = sum((r) => r.goal);
  const achieved = sum((r) => r.achieved);

  const trend = monthsOf(semester).map((month) => {
    const monthRecords = own.filter((r) => r.period === month);
    return { month, avg: average(monthRecords.map(totalScore)), reporting: monthRecords.length };
  });

  const byDepartment = DEPARTMENT_KEYS.map((key) => {
    const group = people.filter((p) => p.department === key);
    return { key, label: DEPARTMENTS[key].short, color: DEPARTMENTS[key].color, avg: average(group.map((p) => p.total)), members: group.length };
  }).filter((d) => d.members > 0);

  return {
    mode,
    period,
    periodLabel: mode === 'semestral' ? `Semestre ${semesterLabel(semester)}` : monthName(period),
    semester,
    people,
    summary: {
      members: scoped.length,
      reporting: withRecord.length,
      avgTotal: average(withRecord.map((p) => p.total)),
      avgCentral: average(withRecord.map((p) => p.central)),
      avgSegments: SCORE_SEGMENTS.map((s) => ({ key: s.key, label: s.label, color: s.color, value: average(withRecord.map((p) => p.record[s.key])) })),
      avgExtra: average(withRecord.map((p) => p.record.scoreExtra)),
      avgCollab: average(withRecord.map((p) => p.record.scoreCollab ?? 0)),
      pnl: sum((r) => r.pnl),
      volume: sum((r) => r.volume),
      operations: sum((r) => r.operationsCount),
      compliance: compliance({ goal, achieved }),
      errors: sum((r) => r.errors),
      incidents: sum((r) => r.incidents),
    },
    trend,
    byDepartment,
  };
}
