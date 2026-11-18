// Parser for the Interactive Brokers PortfolioAnalyst PDF report. Pure: works on rows from pdfLayout.
// Sections are found by title, never by page number, so reports of any length and period work.
// Only "Account Overview" is required; every other section is optional and reported as a warning.

import {
  findCell,
  num,
  numberAbove,
  numberRightOf,
  parseAnalysisPeriod,
  parseShortDate,
  readTable,
  sectionPages,
  splitGroup,
  textBelow,
  textRightOf,
  type PdfPage,
} from './layout';

export type ReturnSet = { mtd: number | null; qtd: number | null; ytd: number | null; oneYear: number | null; sinceInception: number | null };

export type RiskSet = {
  endingVami: number | null;
  maxDrawdownPct: number | null;
  peakToValley: string | null;
  recovery: string | null;
  sharpe: number | null;
  sortino: number | null;
  stdDevPct: number | null;
  downsideDevPct: number | null;
  meanReturnPct: number | null;
  positivePeriodsPct: number | null;
  negativePeriodsPct: number | null;
};

export type Position = {
  symbol: string;
  description: string;
  sector: string;
  assetClass: string;
  currency: string;
  quantity: number | null;
  closePrice: number | null;
  value: number | null;
  costBasis: number | null;
  unrealizedPnl: number | null;
  /** Value in the base currency. */
  baseValue: number | null;
  /** Net parsed weight over NAV from the Concentration section, in %. */
  weightPct: number | null;
};

export type SymbolPerformance = {
  symbol: string;
  description: string;
  sector: string;
  assetClass: string;
  avgWeightPct: number | null;
  returnPct: number | null;
  contributionPct: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  open: boolean;
};

export type TradeSummary = {
  symbol: string;
  description: string;
  sector: string;
  assetClass: string;
  currency: string;
  boughtQty: number | null;
  boughtAvgPrice: number | null;
  boughtProceeds: number | null;
  soldQty: number | null;
  soldAvgPrice: number | null;
  soldProceeds: number | null;
};

export type NavDay = { day: string; nav: number; byClass: Record<string, number> };

/** Return of one month in %, for the account and each benchmark; null when the report shows "-". */
export type MonthlyReturn = { month: string; account: number | null; benchmarks: Record<string, number | null> };

export type IbReportData = {
  accountName: string;
  accountId: string;
  accountType: string;
  baseCurrency: string;
  periodStart: string;
  periodEnd: string;
  summary: {
    navStart: number | null;
    navEnd: number | null;
    mtm: number | null;
    depositsWithdrawals: number | null;
    dividends: number | null;
    interest: number | null;
    feesCommissions: number | null;
    other: number | null;
    changeInNav: number | null;
    cumulativeReturnPct: number | null;
    bestReturnPct: number | null;
    worstReturnPct: number | null;
  };
  returns: { account: ReturnSet | null; benchmarks: Record<string, ReturnSet> };
  monthlyReturns: MonthlyReturn[];
  risk: { account: RiskSet | null; benchmarks: Record<string, RiskSet>; vsBenchmark: Record<string, { correlation: number | null; beta: number | null; alpha: number | null }> };
  positions: Position[];
  navDaily: NavDay[];
  symbols: SymbolPerformance[];
  trades: TradeSummary[];
  /** Sections not found or not readable. */
  warnings: string[];
};

export class IbParseError extends Error {}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "56 (53.85%)" -> 53.85 */
const pctInParens = (s: string | undefined) => num(s?.match(/\(([^)]+)\)/)?.[1]);

const column = (header: string[], name: string) => header.indexOf(name);

function accountOverview(pages: PdfPage[]) {
  const [page] = sectionPages(pages, 'Account Overview');
  if (!page) throw new IbParseError('No se encontró la sección "Account Overview": el PDF no parece un informe PortfolioAnalyst de Interactive Brokers.');

  const accountId = textRightOf(page, 'ACCOUNT:') ?? '';
  if (!/^[A-Z]{1,3}\d{4,}$/.test(accountId)) throw new IbParseError('No se encontró el número de cuenta en "Account Overview".');

  return {
    accountName: textRightOf(page, 'NAME:') ?? '',
    accountId,
    accountType: textRightOf(page, 'ACCOUNT TYPE:') ?? '',
    baseCurrency: textBelow(page, 'BASE CURRENCY') ?? 'USD',
    summary: {
      navStart: numberRightOf(page, 'Beginning NAV'),
      navEnd: numberRightOf(page, 'Ending NAV'),
      mtm: numberRightOf(page, 'MTM'),
      depositsWithdrawals: numberRightOf(page, 'Deposits & Withdrawals'),
      dividends: numberRightOf(page, 'Dividends'),
      interest: numberRightOf(page, 'Interest'),
      feesCommissions: numberRightOf(page, 'Fees & Commissions'),
      other: numberRightOf(page, 'Other'),
      changeInNav: numberRightOf(page, 'Change In NAV'),
      cumulativeReturnPct: numberAbove(page, 'CUMULATIVE RETURN'),
      bestReturnPct: numberAbove(page, 'BEST RETURN'),
      worstReturnPct: numberAbove(page, 'WORST RETURN'),
    },
    /** Fallback risk numbers shown on the overview. */
    overviewRisk: {
      maxDrawdownPct: numberRightOf(page, 'Max Drawdown'),
      sharpe: numberRightOf(page, 'Sharpe Ratio'),
      stdDevPct: numberRightOf(page, 'Standard Deviation'),
    },
  };
}

const RETURN_COLUMNS: [keyof ReturnSet, string][] = [
  ['mtd', 'MTD'],
  ['qtd', 'QTD'],
  ['ytd', 'YTD'],
  ['oneYear', '1 Year'],
  ['sinceInception', 'Since Inception'],
];

function historicalReturns(pages: PdfPage[], accountId: string) {
  const [page] = sectionPages(pages, 'Historical Performance Benchmark Comparison');
  if (!page) return null;
  // The chart axis repeats these labels; the table header is the last row that has them all.
  const headers = page.rows.filter((r) => RETURN_COLUMNS.every(([, label]) => r.cells.some((c) => c.s === label)));
  const header = headers.at(-1);
  if (!header) return null;

  const benchmarks: Record<string, ReturnSet> = {};
  let account: ReturnSet | null = null;
  for (const row of page.rows.filter((r) => r.at > header.at)) {
    const name = row.cells[0]?.s;
    if (!name || name.startsWith('Page:') || name === 'PortfolioAnalyst') continue;
    const set = Object.fromEntries(RETURN_COLUMNS.map(([key]) => [key, null])) as ReturnSet;
    for (const cell of row.cells.slice(1)) {
      const nearest = header.cells.reduce((best, h) => (Math.abs(h.col - cell.col) < Math.abs(best.col - cell.col) ? h : best));
      const key = RETURN_COLUMNS.find(([, label]) => label === nearest.s)?.[0];
      if (key) set[key] = num(cell.s);
    }
    if (name === accountId) account = set;
    else benchmarks[name] = set;
  }
  return { account, benchmarks };
}

function monthlyReturns(pages: PdfPage[], benchmarkNames: string[]): MonthlyReturn[] {
  const result = new Map<string, MonthlyReturn>();
  for (const page of sectionPages(pages, 'Historical Performance Benchmark Comparison')) {
    const yearRow = page.rows.find((r) => r.cells.length > 0 && r.cells.every((c) => /^\d{4}$/.test(c.s)));
    if (!yearRow) continue;
    const nameRow = page.rows.find((r) => r.at > yearRow.at && r.cells.some((c) => benchmarkNames.includes(c.s)));
    if (!nameRow) continue;
    const columns = nameRow.cells
      .filter((c) => c.s !== '%')
      .map((c) => ({
        name: c.s,
        col: c.col,
        year: yearRow.cells.reduce((best, y) => (Math.abs(y.col - c.col) < Math.abs(best.col - c.col) ? y : best)).s,
        isAccount: !benchmarkNames.includes(c.s),
      }));

    for (const row of page.rows.filter((r) => r.at > nameRow.at)) {
      const monthIndex = MONTHS.indexOf(row.cells[0]?.s ?? '');
      if (monthIndex < 0) continue;
      for (const cell of row.cells.slice(1)) {
        const target = columns.reduce((best, c) => (Math.abs(c.col - cell.col) < Math.abs(best.col - cell.col) ? c : best));
        const month = `${target.year}-${String(monthIndex + 1).padStart(2, '0')}`;
        const entry = result.get(month) ?? { month, account: null, benchmarks: {} };
        const value = num(cell.s);
        if (target.isAccount) entry.account = value;
        else entry.benchmarks[target.name] = value;
        result.set(month, entry);
      }
    }
  }
  return [...result.values()].filter((m) => m.account !== null || Object.values(m.benchmarks).some((v) => v !== null)).sort((a, b) => a.month.localeCompare(b.month));
}

const RISK_ROWS: [keyof RiskSet, string, 'num' | 'text' | 'parens'][] = [
  ['endingVami', 'Ending VAMI', 'num'],
  ['maxDrawdownPct', 'Max Drawdown', 'num'],
  ['peakToValley', 'Peak-To-Valley', 'text'],
  ['recovery', 'Recovery', 'text'],
  ['sharpe', 'Sharpe Ratio', 'num'],
  ['sortino', 'Sortino Ratio', 'num'],
  ['stdDevPct', 'Standard Deviation', 'num'],
  ['downsideDevPct', 'Downside Deviation', 'num'],
  ['meanReturnPct', 'Mean Return', 'num'],
  ['positivePeriodsPct', 'Positive Periods', 'parens'],
  ['negativePeriodsPct', 'Negative Periods', 'parens'],
];

function riskMeasures(pages: PdfPage[], accountId: string) {
  const [page] = sectionPages(pages, 'Risk Measures Benchmark Comparison');
  if (!page) return null;
  // The header row holds both tables: "SPXTR EFA VT U123" on the left and "U123 vs. SPXTR EFA VT" on
  // the right. Right-table row labels ("Correlation", "β:", "α:") sit just left of the "vs." cell,
  // so the left table ends a few units before it. A chart legend above repeats the names: skip it.
  const vsHit = findCell(page, /vs\.$/);
  const split = vsHit ? vsHit.cell.col - 8 : Infinity;
  const header = vsHit?.row ?? page.rows.filter((r) => r.cells.some((c) => c.s === accountId)).at(-1);
  if (!header) return null;
  const leftHeaders = header.cells.filter((c) => c.col < split);
  const rightHeaders = header.cells.filter((c) => c.col > split && !/vs\.$/.test(c.s));

  const empty = () => Object.fromEntries(RISK_ROWS.map(([key]) => [key, null])) as RiskSet;
  const sets: Record<string, RiskSet> = Object.fromEntries(leftHeaders.map((h) => [h.s, empty()]));
  const vsBenchmark: Record<string, { correlation: number | null; beta: number | null; alpha: number | null }> = Object.fromEntries(
    rightHeaders.map((h) => [h.s, { correlation: null, beta: null, alpha: null }]),
  );

  for (const row of page.rows.filter((r) => r.at > header.at)) {
    const label = row.cells[0]?.s;
    const spec = RISK_ROWS.find(([, l]) => l === label);
    for (const cell of row.cells.slice(1)) {
      if (cell.col < split && spec && leftHeaders.length) {
        const h = leftHeaders.reduce((best, c) => (Math.abs(c.col - cell.col) < Math.abs(best.col - cell.col) ? c : best));
        const [key, , kind] = spec;
        (sets[h.s] as Record<string, unknown>)[key] = kind === 'text' ? cell.s : kind === 'parens' ? pctInParens(cell.s) : num(cell.s);
      }
    }
    // Right table: "Correlation", "β:", "α:" rows with one value per benchmark.
    const rightLabel = row.cells.find((c) => c.col >= split && /^(Correlation|β:|α:)$/.test(c.s));
    if (rightLabel && rightHeaders.length) {
      const key = rightLabel.s === 'Correlation' ? 'correlation' : rightLabel.s === 'β:' ? 'beta' : 'alpha';
      for (const cell of row.cells.filter((c) => c.col > rightLabel.col)) {
        const h = rightHeaders.reduce((best, c) => (Math.abs(c.col - cell.col) < Math.abs(best.col - cell.col) ? c : best));
        vsBenchmark[h.s][key] = num(cell.s);
      }
    }
  }

  const { [accountId]: account, ...benchmarks } = sets;
  return { account: account ?? null, benchmarks, vsBenchmark };
}

function positions(pages: PdfPage[]): Position[] {
  const { header, rows } = readTable(sectionPages(pages, 'Open Position Summary'), ['Symbol', 'Quantity', 'Close Price', 'Base Value']);
  const at = (name: string) => column(header, name);
  const weights = concentration(pages);
  return rows
    .filter((r) => r.values[at('Symbol')])
    .map((r) => {
      const v = (name: string) => r.values[at(name)] ?? '';
      const { assetClass, currency } = splitGroup(r.group);
      const symbol = v('Symbol');
      return {
        symbol,
        description: v('Description'),
        sector: v('Sector'),
        assetClass,
        currency: currency || symbol,
        quantity: num(v('Quantity')),
        closePrice: num(v('Close Price')),
        value: num(v('Value')),
        costBasis: num(v('Cost Basis')),
        unrealizedPnl: num(v('Unrealized P&L')),
        baseValue: num(v('Base Value')),
        weightPct: weights.get(symbol) ?? null,
      };
    });
}

/** Net parsed weight (%) per symbol from the Concentration section. */
function concentration(pages: PdfPage[]): Map<string, number> {
  const { header, rows } = readTable(sectionPages(pages, 'Concentration'), ['Symbol', 'Net Value', 'Net Parsed Weight %']);
  const symbol = column(header, 'Symbol');
  const weight = column(header, 'Net Parsed Weight %');
  const map = new Map<string, number>();
  for (const r of rows) {
    const w = num(r.values[weight]);
    if (r.values[symbol] && w !== null) map.set(r.values[symbol], w);
  }
  return map;
}

function navDaily(pages: PdfPage[]): NavDay[] {
  const { header, rows } = readTable(sectionPages(pages, 'Allocation by Asset Class'), ['Date', 'NAV']);
  const date = column(header, 'Date');
  const nav = column(header, 'NAV');
  const result: NavDay[] = [];
  for (const r of rows) {
    const day = parseShortDate(r.values[date]?.split(' ')[0] ?? '');
    const value = num(r.values[nav]);
    if (!day || value === null) continue;
    const byClass: Record<string, number> = {};
    header.forEach((name, i) => {
      const n = num(r.values[i]);
      if (i !== date && i !== nav && n !== null) byClass[name] = n;
    });
    result.push({ day, nav: value, byClass });
  }
  return result;
}

function symbolPerformance(pages: PdfPage[]): SymbolPerformance[] {
  const { header, rows } = readTable(sectionPages(pages, 'Performance by Symbol'), ['Symbol', 'Return', 'Contribution', 'Realized P&L']);
  const at = (name: string) => column(header, name);
  return rows
    .filter((r) => r.values[at('Symbol')])
    .map((r) => {
      const v = (name: string) => r.values[at(name)] ?? '';
      return {
        symbol: v('Symbol'),
        description: v('Description'),
        sector: v('Sector'),
        assetClass: r.group,
        avgWeightPct: num(v('Avg Weight')),
        returnPct: num(v('Return')),
        contributionPct: num(v('Contribution')),
        unrealizedPnl: num(v('Unrealized P&L')),
        realizedPnl: num(v('Realized P&L')),
        open: v('Open') === 'Yes',
      };
    });
}

function trades(pages: PdfPage[]): TradeSummary[] {
  const { header, rows } = readTable(sectionPages(pages, 'Trade Summary'), ['Symbol', 'Quantity', 'Average Price', 'Proceeds']);
  // Bought and Sold share column names: Quantity, Average Price, Proceeds appear twice, in that order.
  const qty = header.map((h, i) => (h === 'Quantity' ? i : -1)).filter((i) => i >= 0);
  const avg = header.map((h, i) => (h === 'Average Price' ? i : -1)).filter((i) => i >= 0);
  const proceeds = header.map((h, i) => (h === 'Proceeds' ? i : -1)).filter((i) => i >= 0);
  const at = (name: string) => column(header, name);
  return rows
    .filter((r) => r.values[at('Symbol')])
    .map((r) => {
      const { assetClass, currency } = splitGroup(r.group);
      return {
        symbol: r.values[at('Symbol')],
        description: r.values[at('Description')] ?? '',
        sector: r.values[at('Sector')] ?? '',
        assetClass,
        currency,
        boughtQty: num(r.values[qty[0]]),
        boughtAvgPrice: num(r.values[avg[0]]),
        boughtProceeds: num(r.values[proceeds[0]]),
        soldQty: num(r.values[qty[1]]),
        soldAvgPrice: num(r.values[avg[1]]),
        soldProceeds: num(r.values[proceeds[1]]),
      };
    });
}

/** Runs one optional section; a failure becomes a warning instead of failing the whole report. */
function optional<T>(warnings: string[], name: string, fallback: T, read: () => T, isEmpty: (value: T) => boolean): T {
  try {
    const value = read();
    if (isEmpty(value)) warnings.push(`Sección no encontrada o vacía: ${name}`);
    return value;
  } catch (error) {
    warnings.push(`No se pudo leer la sección ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

export function parsePortfolioAnalyst(pages: PdfPage[]): IbReportData {
  const overview = accountOverview(pages);
  const period = parseAnalysisPeriod(sectionPages(pages, 'Account Overview')) ?? parseAnalysisPeriod(pages);
  if (!period) throw new IbParseError('No se encontró el periodo de análisis ("Analysis Period") del informe.');
  if (overview.summary.navEnd === null) throw new IbParseError('No se encontró el NAV final ("Ending NAV") en "Account Overview".');

  const warnings: string[] = [];
  const history = optional(warnings, 'Historical Performance', null, () => historicalReturns(pages, overview.accountId), (v) => !v);
  const benchmarkNames = Object.keys(history?.benchmarks ?? {});
  const risk = optional(warnings, 'Risk Measures', null, () => riskMeasures(pages, overview.accountId), (v) => !v?.account);

  // Use the overview figures when the risk section is missing.
  const accountRisk: RiskSet | null =
    risk?.account ??
    (overview.overviewRisk.maxDrawdownPct !== null
      ? {
          endingVami: null,
          maxDrawdownPct: overview.overviewRisk.maxDrawdownPct,
          peakToValley: null,
          recovery: null,
          sharpe: overview.overviewRisk.sharpe,
          sortino: null,
          stdDevPct: overview.overviewRisk.stdDevPct,
          downsideDevPct: null,
          meanReturnPct: null,
          positivePeriodsPct: null,
          negativePeriodsPct: null,
        }
      : null);

  return {
    accountName: overview.accountName,
    accountId: overview.accountId,
    accountType: overview.accountType,
    baseCurrency: overview.baseCurrency,
    periodStart: period.start,
    periodEnd: period.end,
    summary: overview.summary,
    returns: { account: history?.account ?? null, benchmarks: history?.benchmarks ?? {} },
    monthlyReturns: optional(warnings, 'Historical Performance (mensual)', [], () => monthlyReturns(pages, benchmarkNames), (v) => v.length === 0),
    risk: { account: accountRisk, benchmarks: risk?.benchmarks ?? {}, vsBenchmark: risk?.vsBenchmark ?? {} },
    positions: optional(warnings, 'Open Position Summary', [], () => positions(pages), (v) => v.length === 0),
    navDaily: optional(warnings, 'Allocation by Asset Class', [], () => navDaily(pages), (v) => v.length === 0),
    symbols: optional(warnings, 'Performance by Symbol', [], () => symbolPerformance(pages), (v) => v.length === 0),
    trades: optional(warnings, 'Trade Summary', [], () => trades(pages), (v) => v.length === 0),
    warnings,
  };
}
