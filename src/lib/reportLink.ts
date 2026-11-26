// Builds the URL of the printable KPI report (/informe). Shared by the buttons that open it.

import type { DepartmentKey } from './floorplan';

export type ReportScope = { kind: 'all' } | { kind: 'department'; department: DepartmentKey } | { kind: 'member'; memberId: string };

/** period: YYYY-MM (monthly) or YYYY-H1/H2 (semester). */
export function reportUrl(scope: ReportScope, period: string): string {
  const params = new URLSearchParams({ period });
  if (scope.kind === 'department') params.set('department', scope.department);
  if (scope.kind === 'member') params.set('member', scope.memberId);
  return `/informe?${params.toString()}`;
}

export function openReport(scope: ReportScope, period: string) {
  window.open(reportUrl(scope, period), '_blank', 'noopener');
}
