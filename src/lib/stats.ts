// Aggregated statistics for the floor plan panels. Pure functions, shared by the UI only.

import { STATIONS, type DepartmentKey, type Station } from './floorplan';
import { compliance, SCORE_SEGMENTS, totalScore, type KpiRecord, type Member } from './kpis';

/** A KPI record of one month tagged with its member. */
export type MemberRecord = KpiRecord & { memberId: string };

/** Response of GET /api/kpis. */
export type PeriodKpis = {
  /** Month shown, as YYYY-MM. Null when there are no KPI records at all. */
  period: string | null;
  /** Months that have at least one record, newest first. */
  periods: string[];
  records: MemberRecord[];
};

export type StationStat = {
  station: Station;
  member: Member | undefined;
  /** Department this station counts for: the member's own department, else the station's. */
  department: DepartmentKey;
  /** Record of the selected period, or undefined when the member has none for that month. */
  record: KpiRecord | undefined;
  score: number | null;
};

export type GroupStats = {
  stations: number;
  occupied: number;
  /** Occupied stations with a KPI record in the period. */
  reporting: number;
  avgScore: number | null;
  /** Average of each score segment over the reporting stations. */
  avgSegments: Record<(typeof SCORE_SEGMENTS)[number]['key'], number>;
  pnl: number;
  volume: number;
  operations: number;
  goal: number;
  achieved: number;
  /** Sum achieved over sum goal, in percent. Null without goals. */
  compliance: number | null;
  errors: number;
  incidents: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * One record per member out of several months (a semester): score segments and P&L % averaged over
 * the months with a record, amounts and counts added up. Since the total score is a weighted sum of
 * the segments, the result's total score is the average of the monthly totals.
 */
export function aggregateByMember(records: MemberRecord[]): MemberRecord[] {
  const byMember = new Map<string, MemberRecord[]>();
  for (const r of records) byMember.set(r.memberId, [...(byMember.get(r.memberId) ?? []), r]);

  return [...byMember.entries()].map(([memberId, list]) => {
    const avg = (pick: (r: KpiRecord) => number) => round1(list.reduce((s, r) => s + pick(r), 0) / list.length);
    const sum = (pick: (r: KpiRecord) => number) => list.reduce((s, r) => s + pick(r), 0);
    return {
      memberId,
      period: list.map((r) => r.period).sort().at(-1) ?? '',
      operationsCount: sum((r) => r.operationsCount),
      volume: sum((r) => r.volume),
      pnl: sum((r) => r.pnl),
      pnlPct: avg((r) => r.pnlPct),
      goal: sum((r) => r.goal),
      achieved: sum((r) => r.achieved),
      errors: sum((r) => r.errors),
      incidents: sum((r) => r.incidents),
      scoreOperational: avg((r) => r.scoreOperational),
      scoreProjects: avg((r) => r.scoreProjects),
      scoreScreenTime: avg((r) => r.scoreScreenTime),
      scoreExtra: avg((r) => r.scoreExtra),
      notes: '',
    };
  });
}

export function stationStats(members: Member[], records: MemberRecord[]): StationStat[] {
  const memberByStation = new Map(members.map((m) => [m.stationId, m]));
  const recordByMember = new Map(records.map((r) => [r.memberId, r]));
  return STATIONS.map((station) => {
    const member = memberByStation.get(station.id);
    const record = member ? recordByMember.get(member.id) : undefined;
    return { station, member, department: member?.departmentKey ?? station.department, record, score: record ? totalScore(record) : null };
  });
}

export function groupStats(stats: StationStat[]): GroupStats {
  const withRecord = stats.filter((s): s is StationStat & { record: KpiRecord } => s.record !== undefined);
  const sum = (pick: (r: KpiRecord) => number) => withRecord.reduce((total, s) => total + pick(s.record), 0);
  const n = withRecord.length;
  const goal = sum((r) => r.goal);
  const achieved = sum((r) => r.achieved);

  return {
    stations: stats.length,
    occupied: stats.filter((s) => s.member).length,
    reporting: n,
    avgScore: n ? round1(withRecord.reduce((total, s) => total + (s.score ?? 0), 0) / n) : null,
    avgSegments: Object.fromEntries(
      SCORE_SEGMENTS.map((segment) => [segment.key, n ? round1(sum((r) => r[segment.key]) / n) : 0]),
    ) as GroupStats['avgSegments'],
    pnl: sum((r) => r.pnl),
    volume: sum((r) => r.volume),
    operations: sum((r) => r.operationsCount),
    goal,
    achieved,
    compliance: compliance({ goal, achieved }),
    errors: sum((r) => r.errors),
    incidents: sum((r) => r.incidents),
  };
}

export const statsOfDepartment = (stats: StationStat[], department: DepartmentKey | null) =>
  department === null ? stats : stats.filter((s) => s.department === department);

/** 1-based position of the station by score among the reporting stations of its department. */
export function rankInDepartment(stats: StationStat[], stationId: string): { rank: number; of: number } | null {
  const target = stats.find((s) => s.station.id === stationId);
  if (!target || target.score === null) return null;
  const peers = stats.filter((s) => s.department === target.department && s.score !== null);
  const rank = peers.filter((s) => (s.score ?? 0) > (target.score ?? 0)).length + 1;
  return { rank, of: peers.length };
}
