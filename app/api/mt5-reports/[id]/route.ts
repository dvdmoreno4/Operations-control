import { parseUuid, route } from '@/src/lib/api';
import { deleteMt5Report, loadMt5Report, MT5_NOT_FOUND } from '@/src/lib/mt5/reportsDb';
import type { Mt5ReportDetail } from '@/src/lib/mt5/types';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Full MetaTrader 5 report: results, balance curve, monthly returns, symbols, open positions, score. */
export const GET = route<Context>(async (_req, { params }): Promise<Mt5ReportDetail> => loadMt5Report(parseUuid((await params).id, MT5_NOT_FOUND)));

export const DELETE = route<Context>(async (_req, { params }) => {
  await deleteMt5Report(parseUuid((await params).id, MT5_NOT_FOUND));
  return { ok: true };
});
