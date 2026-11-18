import { parseUuid, route } from '@/src/lib/api';
import { deleteReport, loadReport, REPORT_NOT_FOUND } from '@/src/lib/ib/reportsDb';
import type { IbReportDetail } from '@/src/lib/ib/types';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Full IB report: summary, returns, risk, positions, daily NAV, symbols, trades and recommendations. */
export const GET = route<Context>(async (_req, { params }): Promise<IbReportDetail> => loadReport(parseUuid((await params).id, REPORT_NOT_FOUND)));

export const DELETE = route<Context>(async (_req, { params }) => {
  await deleteReport(parseUuid((await params).id, REPORT_NOT_FOUND));
  return { ok: true };
});
