// Layout helpers over PDF rows: section lookup, label/value pairs and tables. Pure, no PDF library.

export type Cell = { s: string; col: number };
export type Row = { at: number; cells: Cell[] };
export type PdfPage = { number: number; rows: Row[] };

/** Parses an IB number: "1,234.56", "-0.61%", "(12.00)", "−5". Null for "-", "", "N/A" and text. */
export function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const s = value.trim().replace(/−/g, '-');
  if (!s || s === '-' || s === '--') return null;
  const negative = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),%\s]/g, '').replace(/^\+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return negative ? -n : n;
}

const isFooter = (row: Row) => row.cells.some((c) => /^Page:\s*\d+/.test(c.s));

/** Title of a page: the first cell of its first row, e.g. "Account Overview" or "Trade Summary (Cont.)". */
export const pageTitle = (page: PdfPage) => page.rows[0]?.cells[0]?.s ?? '';

/** Pages of a section, including its "(Cont.)" pages, in order. */
export function sectionPages(pages: PdfPage[], title: string): PdfPage[] {
  return pages.filter((p) => {
    const t = pageTitle(p);
    return t === title || t === `${title} (Cont.)`;
  });
}

export function findCell(page: PdfPage, text: string | RegExp): { row: Row; cell: Cell; index: number } | null {
  for (const row of page.rows) {
    const index = row.cells.findIndex((c) => (typeof text === 'string' ? c.s === text : text.test(c.s)));
    if (index >= 0) return { row, cell: row.cells[index], index };
  }
  return null;
}

/** First numeric cell to the right of a label on the same row. */
export function numberRightOf(page: PdfPage, label: string): number | null {
  const hit = findCell(page, label);
  if (!hit) return null;
  for (const cell of hit.row.cells.slice(hit.index + 1)) {
    const n = num(cell.s);
    if (n !== null) return n;
    break;
  }
  return null;
}

/** First text cell to the right of a label on the same row. */
export function textRightOf(page: PdfPage, label: string): string | null {
  const hit = findCell(page, label);
  return hit?.row.cells[hit.index + 1]?.s ?? null;
}

/** Cell in a nearby row above (or below) a label, roughly in the same column. */
function cellNear(page: PdfPage, label: string, direction: -1 | 1, maxGap: number, colFrom: number, colTo: number): Cell | null {
  const hit = findCell(page, label);
  if (!hit) return null;
  const rows = page.rows
    .filter((r) => (direction === -1 ? r.at < hit.row.at && hit.row.at - r.at <= maxGap : r.at > hit.row.at && r.at - hit.row.at <= maxGap))
    .sort((a, b) => Math.abs(a.at - hit.row.at) - Math.abs(b.at - hit.row.at));
  for (const row of rows) {
    const cell = row.cells.find((c) => c.col >= hit.cell.col + colFrom && c.col <= hit.cell.col + colTo);
    if (cell) return cell;
  }
  return null;
}

export const numberAbove = (page: PdfPage, label: string) => num(cellNear(page, label, -1, 15, -12, 12)?.s);
export const textBelow = (page: PdfPage, label: string) => cellNear(page, label, 1, 15, -5, 60)?.s ?? null;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "May 26, 2026" -> "2026-05-26". */
export function parseLongDate(text: string): string | null {
  const m = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const month = m ? MONTHS[m[1].toLowerCase()] : undefined;
  if (!m || !month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** "05/26/26" or "05/26/2026" -> "2026-05-26". */
export function parseShortDate(text: string): string | null {
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[1]}-${m[2]}`;
}

/** "Analysis Period: January 1, 2026 - May 26, 2026 (TWR)" -> start/end dates. */
export function parseAnalysisPeriod(pages: PdfPage[]): { start: string; end: string } | null {
  for (const page of pages) {
    const hit = findCell(page, /^Analysis Period:/);
    if (!hit) continue;
    const m = hit.cell.s.replace(/^Analysis Period:\s*/, '').replace(/\(.*\)\s*$/, '').split(/\s+-\s+/);
    const start = m[0] ? parseLongDate(m[0]) : null;
    const end = m[1] ? parseLongDate(m[1]) : null;
    if (start && end) return { start, end };
  }
  return null;
}

export type TableRow = {
  /** Text per column, aligned to the header; cells in the same column are joined with a space. */
  values: string[];
  /** Group label rows seen above this row, e.g. "Options (USD)". */
  group: string;
};

/**
 * Reads a table across pages. The header row is the first row that contains every `required` label;
 * each data cell goes to the last header column that starts at or before the cell (+ tolerance),
 * which fits IB's left-aligned headers and right-aligned numbers. Rows with text only in the first
 * column are group labels; rows whose first cell starts with "Total" are skipped.
 */
export function readTable(pages: PdfPage[], required: string[], tolerance = 15): { header: string[]; rows: TableRow[] } {
  let header: Cell[] | null = null;
  const rows: TableRow[] = [];
  let group = '';

  for (const page of pages) {
    const headerIndex = page.rows.findIndex((r) => required.every((label) => r.cells.some((c) => c.s === label)));
    if (headerIndex < 0) continue;
    header ??= page.rows[headerIndex].cells;
    const columns = page.rows[headerIndex].cells;

    for (const row of page.rows.slice(headerIndex + 1)) {
      if (isFooter(row)) break;
      const values = columns.map(() => '');
      for (const cell of row.cells) {
        let index = -1;
        for (let i = 0; i < columns.length; i++) if (columns[i].col <= cell.col + tolerance) index = i;
        if (index < 0) index = 0;
        values[index] = values[index] ? `${values[index]} ${cell.s}` : cell.s;
      }
      const first = values[0];
      if (!first && values.every((v) => !v)) continue;
      if (values.slice(1).every((v) => !v)) {
        // Group label, possibly split over two rows: "Corporate and Agency Debt Securities" + "(USD)".
        group = first.startsWith('(') && group ? `${group} ${first}` : first;
        continue;
      }
      if (/^Total\b/i.test(first)) continue;
      rows.push({ values, group });
    }
  }
  return { header: header?.map((c) => c.s) ?? [], rows };
}

/** Splits "Options (USD)" into asset class and currency. */
export function splitGroup(group: string): { assetClass: string; currency: string } {
  const m = group.match(/^(.*?)\s*\(([A-Z]{3})\)\s*$/);
  return m ? { assetClass: m[1], currency: m[2] } : { assetClass: group, currency: '' };
}
