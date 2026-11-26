// Parser for the MetaTrader 5 "Trade History Report" exported to Excel. Pure: works on sheet rows.
// Sections ("Positions", "Deals", "Open Positions", "Results"...) and columns are found by their
// labels, never by fixed cells, so any file name and number of rows work. English reports.

import type { SheetRow } from './xlsx';

export class Mt5ParseError extends Error {}

export type Mt5Results = {
  totalNetProfit: number | null;
  grossProfit: number | null;
  grossLoss: number | null;
  profitFactor: number | null;
  expectedPayoff: number | null;
  recoveryFactor: number | null;
  sharpeRatio: number | null;
  balanceDrawdownAbsolute: number | null;
  balanceDrawdownMaximal: number | null;
  balanceDrawdownMaximalPct: number | null;
  balanceDrawdownRelativePct: number | null;
  totalTrades: number | null;
  shortTrades: number | null;
  shortWonPct: number | null;
  longTrades: number | null;
  longWonPct: number | null;
  profitTrades: number | null;
  profitTradesPct: number | null;
  lossTrades: number | null;
  lossTradesPct: number | null;
  largestProfitTrade: number | null;
  largestLossTrade: number | null;
  averageProfitTrade: number | null;
  averageLossTrade: number | null;
  maxConsecutiveWins: number | null;
  maxConsecutiveLosses: number | null;
};

export type Mt5Summary = {
  balance: number | null;
  equity: number | null;
  floatingPnl: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  creditFacility: number | null;
};

export type BalancePoint = { day: string; balance: number };
export type Mt5MonthlyReturn = { month: string; returnPct: number | null; profit: number; deposits: number };
export type Mt5Symbol = { symbol: string; trades: number; wins: number; profit: number };
export type Mt5OpenPosition = { symbol: string; type: string; volume: number | null; openPrice: number | null; marketPrice: number | null; swap: number | null; profit: number | null };

export type Mt5ReportData = {
  accountName: string;
  account: string;
  company: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  initialBalance: number;
  deposits: number;
  withdrawals: number;
  totalReturnPct: number | null;
  ytdPct: number | null;
  commissions: number;
  swaps: number;
  fees: number;
  summary: Mt5Summary;
  results: Mt5Results;
  /** End-of-day balance, for the balance graph. */
  balanceCurve: BalancePoint[];
  monthlyReturns: Mt5MonthlyReturn[];
  symbols: Mt5Symbol[];
  openPositions: Mt5OpenPosition[];
  dealsCount: number;
  warnings: string[];
};

const colIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const sortedCells = (row: SheetRow) => Object.entries(row.cells).sort((a, b) => colIndex(a[0]) - colIndex(b[0]));
const norm = (s: string) => s.trim().toLowerCase();

/** "6 231.69 (6.42%)" -> { value: 6231.69, paren: 6.42 }; "-4 728.30" -> -4728.3; "54.01%" -> 54.01. */
export function mt5Number(text: string | undefined): { value: number | null; paren: number | null } {
  if (!text) return { value: null, paren: null };
  const clean = (s: string) => {
    const t = s.replace(/(\d)[\s ]+(?=\d)/g, '$1').replace(/[%\s ]/g, '');
    return /^-?\d+(\.\d+)?(E-?\d+)?$/i.test(t) ? Number(t) : null;
  };
  const m = text.match(/^([^()]*)(?:\(([^)]*)\))?/);
  return { value: clean(m?.[1] ?? ''), paren: m?.[2] ? clean(m[2]) : null };
}

const num = (text: string | undefined) => mt5Number(text).value;
const isDateTime = (s: string | undefined) => !!s && /^\d{4}\.\d{2}\.\d{2}/.test(s);
/** "2026.01.05 16:32:03" -> "2026-01-05" */
const dayOf = (s: string) => s.slice(0, 10).replace(/\./g, '-');

/** Value to the right of a "Label:" cell anywhere in the rows. */
function labelValues(rows: SheetRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const cells = sortedCells(row);
    cells.forEach(([, text], i) => {
      if (/:$/.test(text) && cells[i + 1] && !/:$/.test(cells[i + 1][1])) {
        const key = norm(text.slice(0, -1));
        if (!map.has(key)) map.set(key, cells[i + 1][1]);
      }
    });
  }
  return map;
}

/** Index of the row whose column A is exactly `title`. */
const sectionIndex = (rows: SheetRow[], title: string) => rows.findIndex((r) => norm(r.cells.A ?? '') === norm(title) && Object.keys(r.cells).length === 1);

/**
 * A table right below a section title: the header row maps each label to its column (later
 * duplicates get "#2"), and data rows run while column A holds a date.
 */
function readSectionTable(rows: SheetRow[], title: string): { columns: Map<string, string>; data: SheetRow[] } | null {
  const start = sectionIndex(rows, title);
  if (start < 0 || !rows[start + 1]) return null;
  const columns = new Map<string, string>();
  for (const [col, label] of sortedCells(rows[start + 1])) {
    const key = norm(label);
    columns.set(columns.has(key) ? `${key}#2` : key, col);
  }
  const data: SheetRow[] = [];
  for (const row of rows.slice(start + 2)) {
    if (!isDateTime(row.cells.A)) break;
    data.push(row);
  }
  return { columns, data };
}

const cell = (row: SheetRow, columns: Map<string, string>, name: string) => {
  const col = columns.get(name);
  return col ? row.cells[col] : undefined;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function parseMt5Report(sheets: SheetRow[][]): Mt5ReportData {
  const rows = sheets.flat();
  if (!rows.some((r) => /trade history report/i.test(r.cells.A ?? ''))) {
    throw new Mt5ParseError('El Excel no parece un informe de MetaTrader 5 ("Trade History Report", exportado en inglés).');
  }

  const deals = readSectionTable(rows, 'Deals');
  if (!deals || !deals.columns.has('balance') || deals.data.length === 0) {
    throw new Mt5ParseError('No se encontró la sección "Deals" con la columna Balance en el informe de MetaTrader 5.');
  }

  const labels = labelValues(rows);
  const warnings: string[] = [];
  const at = (label: string) => labels.get(label);

  // Deals: balance after each deal, deposits / withdrawals and costs.
  const dc = deals.columns;
  let deposits = 0;
  let withdrawals = 0;
  let commissions = 0;
  let swaps = 0;
  let fees = 0;
  type Deal = { time: string; type: string; flow: number; balance: number };
  const list: Deal[] = [];
  for (const row of deals.data) {
    const type = norm(cell(row, dc, 'type') ?? '');
    const profit = num(cell(row, dc, 'profit')) ?? 0;
    const balance = num(cell(row, dc, 'balance'));
    if (balance === null) continue;
    commissions += num(cell(row, dc, 'commission')) ?? 0;
    swaps += num(cell(row, dc, 'swap')) ?? 0;
    fees += num(cell(row, dc, 'fee')) ?? 0;
    // Non-trading deals (balance, credit) move money in or out of the account.
    const isFlow = type === 'balance' || type === 'credit';
    if (isFlow) {
      if (profit >= 0) deposits += profit;
      else withdrawals += -profit;
    }
    list.push({ time: row.cells.A!, type, flow: isFlow ? profit : 0, balance });
  }
  if (list.length === 0) throw new Mt5ParseError('La sección "Deals" no tiene operaciones con balance.');

  const first = deals.data[0];
  const firstChange =
    (num(cell(first, dc, 'profit')) ?? 0) + (num(cell(first, dc, 'commission')) ?? 0) + (num(cell(first, dc, 'swap')) ?? 0) + (num(cell(first, dc, 'fee')) ?? 0);
  const initialBalance = round2(list[0].balance - firstChange);

  // End-of-day balance curve.
  const byDay = new Map<string, number>();
  for (const d of list) byDay.set(dayOf(d.time), d.balance);
  const balanceCurve = [...byDay.entries()].map(([day, balance]) => ({ day, balance }));

  // Monthly returns from the balance, net of deposits and withdrawals.
  const monthly = new Map<string, { start: number; end: number; flows: number }>();
  let previous = initialBalance;
  for (const d of list) {
    const month = dayOf(d.time).slice(0, 7);
    const entry = monthly.get(month) ?? { start: previous, end: previous, flows: 0 };
    entry.end = d.balance;
    entry.flows += d.flow;
    monthly.set(month, entry);
    previous = d.balance;
  }
  const monthlyReturns: Mt5MonthlyReturn[] = [...monthly.entries()].map(([month, m]) => {
    const profit = m.end - m.start - m.flows;
    const base = m.start > 0 ? m.start : m.flows > 0 ? m.flows : 0;
    return { month, returnPct: base > 0 ? round2((profit / base) * 100) : null, profit: round2(profit), deposits: round2(m.flows) };
  });
  const compound = (list: Mt5MonthlyReturn[]) =>
    list.length && list.every((m) => m.returnPct !== null)
      ? round2((list.reduce((acc, m) => acc * (1 + (m.returnPct ?? 0) / 100), 1) - 1) * 100)
      : null;
  const periodEnd = dayOf(list.at(-1)!.time);

  // Closed positions per symbol.
  const positions = readSectionTable(rows, 'Positions');
  const symbolMap = new Map<string, Mt5Symbol>();
  if (positions) {
    const pc = positions.columns;
    for (const row of positions.data) {
      const symbol = cell(row, pc, 'symbol') ?? '?';
      const result = (num(cell(row, pc, 'profit')) ?? 0) + (num(cell(row, pc, 'commission')) ?? 0) + (num(cell(row, pc, 'swap')) ?? 0);
      const s = symbolMap.get(symbol) ?? { symbol, trades: 0, wins: 0, profit: 0 };
      s.trades += 1;
      if (result > 0) s.wins += 1;
      s.profit = round2(s.profit + result);
      symbolMap.set(symbol, s);
    }
  } else warnings.push('Sección no encontrada: Positions');

  const open = readSectionTable(rows, 'Open Positions');
  const openPositions: Mt5OpenPosition[] = (open?.data ?? []).map((row) => ({
    symbol: cell(row, open!.columns, 'symbol') ?? '?',
    type: cell(row, open!.columns, 'type') ?? '',
    volume: num(cell(row, open!.columns, 'volume')),
    openPrice: num(cell(row, open!.columns, 'price')),
    marketPrice: num(cell(row, open!.columns, 'market price')),
    swap: num(cell(row, open!.columns, 'swap')),
    profit: num(cell(row, open!.columns, 'profit')),
  }));

  if (sectionIndex(rows, 'Results') < 0) warnings.push('Sección no encontrada: Results');
  const pair = (label: string) => mt5Number(at(label));

  return {
    accountName: at('name') ?? '',
    account: at('account') ?? '',
    company: at('company') ?? '',
    generatedAt: at('date') ?? '',
    periodStart: dayOf(list[0].time),
    periodEnd,
    initialBalance,
    deposits: round2(deposits),
    withdrawals: round2(withdrawals),
    totalReturnPct: compound(monthlyReturns),
    ytdPct: compound(monthlyReturns.filter((m) => m.month.startsWith(periodEnd.slice(0, 4)))),
    commissions: round2(commissions),
    swaps: round2(swaps),
    fees: round2(fees),
    summary: {
      balance: num(at('balance')),
      equity: num(at('equity')),
      floatingPnl: num(at('floating p/l')),
      margin: num(at('margin')),
      freeMargin: num(at('free margin')),
      marginLevel: num(at('margin level')),
      creditFacility: num(at('credit facility')),
    },
    results: {
      totalNetProfit: num(at('total net profit')),
      grossProfit: num(at('gross profit')),
      grossLoss: num(at('gross loss')),
      profitFactor: num(at('profit factor')),
      expectedPayoff: num(at('expected payoff')),
      recoveryFactor: num(at('recovery factor')),
      sharpeRatio: num(at('sharpe ratio')),
      balanceDrawdownAbsolute: num(at('balance drawdown absolute')),
      balanceDrawdownMaximal: pair('balance drawdown maximal').value,
      balanceDrawdownMaximalPct: pair('balance drawdown maximal').paren,
      balanceDrawdownRelativePct: pair('balance drawdown relative').value,
      totalTrades: num(at('total trades')),
      shortTrades: pair('short trades (won %)').value,
      shortWonPct: pair('short trades (won %)').paren,
      longTrades: pair('long trades (won %)').value,
      longWonPct: pair('long trades (won %)').paren,
      profitTrades: pair('profit trades (% of total)').value,
      profitTradesPct: pair('profit trades (% of total)').paren,
      lossTrades: pair('loss trades (% of total)').value,
      lossTradesPct: pair('loss trades (% of total)').paren,
      largestProfitTrade: num(at('largest profit trade')),
      largestLossTrade: num(at('largest loss trade')),
      averageProfitTrade: num(at('average profit trade')),
      averageLossTrade: num(at('average loss trade')),
      maxConsecutiveWins: pair('maximum consecutive wins ($)').value,
      maxConsecutiveLosses: pair('maximum consecutive losses ($)').value,
    },
    balanceCurve,
    monthlyReturns,
    symbols: [...symbolMap.values()].sort((a, b) => b.profit - a.profit),
    openPositions,
    dealsCount: list.length,
    warnings,
  };
}
