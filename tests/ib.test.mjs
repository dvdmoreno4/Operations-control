// Run with: npm test
// The real-report test only runs when IB_SAMPLE_PDF points to a PortfolioAnalyst PDF (never commit it):
//   IB_SAMPLE_PDF="C:/ruta/Informe IBKR.pdf" npm test
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { num, parseAnalysisPeriod, parseLongDate, parseShortDate, readTable, splitGroup } from '../src/lib/ib/layout.ts';
import { IbParseError, parsePortfolioAnalyst } from '../src/lib/ib/portfolioAnalyst.ts';
import { computeMetrics, operationalScore, recommendations } from '../src/lib/ib/score.ts';

const row = (at, ...cells) => ({ at, cells: cells.map(([s, col]) => ({ s, col })) });

test('num reads IB numbers', () => {
  assert.equal(num('1,234.56'), 1234.56);
  assert.equal(num('-0.61%'), -0.61);
  assert.equal(num('(12.50)'), -12.5);
  assert.equal(num('−5'), -5);
  assert.equal(num('-'), null);
  assert.equal(num('GOOG'), null);
});

test('dates', () => {
  assert.equal(parseLongDate('May 26, 2026'), '2026-05-26');
  assert.equal(parseShortDate('01/05/26'), '2026-01-05');
  assert.deepEqual(
    parseAnalysisPeriod([{ number: 1, rows: [row(30, ['Analysis Period: January 1, 2026 - May 26, 2026 (TWR)', 600])] }]),
    { start: '2026-01-01', end: '2026-05-26' },
  );
  assert.deepEqual(splitGroup('Options (USD)'), { assetClass: 'Options', currency: 'USD' });
});

test('readTable maps right-aligned numbers to left-aligned headers, groups and continuation pages', () => {
  const header = row(60, ['Symbol', 29], ['Description', 143], ['Quantity', 411], ['Value', 539]);
  const pages = [
    {
      number: 6,
      rows: [
        row(34, ['Open Position Summary', 24]),
        header,
        row(70, ['Options (USD)', 26]),
        row(80, ['AMD', 26], ['260618P00320000', 44], ['AMD 18JUN26 320 P', 140], ['-1', 432], ['-79.50', 540]),
        row(90, ['Total', 26], ['-79.50', 540]),
        row(592, ['PortfolioAnalyst', 30], ['Page: 6', 741]),
      ],
    },
    {
      number: 7,
      rows: [row(34, ['Open Position Summary (Cont.)', 24]), header, row(70, ['Corporate and Agency Debt Securities', 26]), row(76, ['(USD)', 26]), row(86, ['JPM 8 04/29/27', 26], ['JPM 8 04/29/27', 140], ['4,000', 422], ['4,146.20', 534])],
    },
  ];
  const { header: names, rows } = readTable(pages, ['Symbol', 'Quantity', 'Value']);
  assert.deepEqual(names, ['Symbol', 'Description', 'Quantity', 'Value']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { values: ['AMD 260618P00320000', 'AMD 18JUN26 320 P', '-1', '-79.50'], group: 'Options (USD)' });
  assert.equal(rows[1].group, 'Corporate and Agency Debt Securities (USD)');
  assert.equal(rows[1].values[3], '4,146.20');
});

test('a PDF without Account Overview is rejected with a clear error', () => {
  assert.throws(() => parsePortfolioAnalyst([{ number: 1, rows: [row(34, ['Activity Statement', 24])] }]), IbParseError);
});

const sample = process.env.IB_SAMPLE_PDF;
test('real PortfolioAnalyst report', { skip: !sample || !existsSync(sample) ? 'IB_SAMPLE_PDF no definido' : false }, async () => {
  const { readPdfPages } = await import('../src/lib/ib/pdfLayout.ts');
  const report = parsePortfolioAnalyst(await readPdfPages(new Uint8Array(readFileSync(sample))));
  assert.deepEqual(report.warnings, []);
  assert.match(report.accountId, /^U\d+$/);
  assert.ok(report.periodStart < report.periodEnd);
  assert.ok(report.summary.navStart !== null && report.summary.navEnd !== null);
  // Beginning NAV + change = ending NAV.
  assert.ok(Math.abs(report.summary.navStart + report.summary.changeInNav - report.summary.navEnd) < 0.05);
  assert.ok(report.monthlyReturns.length > 0);
  assert.ok(report.risk.account?.maxDrawdownPct !== null);
  assert.ok(report.positions.length > 0 && report.navDaily.length > 0 && report.symbols.length > 0);
  assert.equal(report.navDaily.at(-1).nav, report.summary.navEnd);

  const metrics = computeMetrics(report);
  const score = operationalScore(report, metrics);
  assert.ok(score.score !== null && score.score >= 0 && score.score <= 100);
  assert.ok(Array.isArray(recommendations(report, metrics)));
});
