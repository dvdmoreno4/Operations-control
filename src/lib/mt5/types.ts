// Shapes the MetaTrader 5 report API returns to the browser. Client-safe: types only.

import type { Recommendation, SubScore } from '../ib/score';
import type { Mt5ReportData } from './report';
import type { Mt5Metrics } from './score';

export type Mt5ReportListItem = {
  id: string;
  /** Month the report is scored for, YYYY-MM. */
  period: string;
  fileName: string;
  returnPct: number | null;
  score: number | null;
  uploadedAt: string;
};

export type Mt5ReportDetail = Mt5ReportListItem & {
  memberId: string;
  data: Mt5ReportData;
  metrics: Mt5Metrics;
  scoreParts: SubScore[];
  recommendations: Recommendation[];
};
