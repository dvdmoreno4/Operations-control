// Shapes the IB report API returns to the browser. Client-safe: types only.

import type { IbReportData, MonthlyReturn, NavDay, Position, SymbolPerformance, TradeSummary } from './portfolioAnalyst';
import type { Metrics, Recommendation, SubScore } from './score';

export type IbReportListItem = {
  id: string;
  /** Month the report is scored for, YYYY-MM. */
  period: string;
  periodStart: string | null;
  periodEnd: string | null;
  fileName: string;
  accountId: string;
  navEnd: number | null;
  returnPct: number | null;
  score: number | null;
  uploadedAt: string;
};

export type IbReportAnalytics = {
  summary: IbReportData['summary'];
  returns: IbReportData['returns'];
  risk: IbReportData['risk'];
  metrics: Metrics;
  scoreParts: SubScore[];
};

export type IbReportDetail = IbReportListItem & {
  memberId: string;
  accountName: string;
  accountType: string;
  baseCurrency: string;
  analytics: IbReportAnalytics;
  warnings: string[];
  monthlyReturns: MonthlyReturn[];
  positions: Position[];
  navDaily: NavDay[];
  symbols: SymbolPerformance[];
  trades: TradeSummary[];
  recommendations: Recommendation[];
};
