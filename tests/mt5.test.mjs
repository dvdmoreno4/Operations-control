// Run with: npm test
// The real-report test only runs when MT5_SAMPLE_XLSX points to an MT5 Excel report (never commit it):
//   MT5_SAMPLE_XLSX="C:/ruta/Report.xlsx" npm test
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Mt5ParseError, mt5Number, parseMt5Report } from '../src/lib/mt5/report.ts';
import { mt5Metrics, mt5Recommendations, mt5Score } from '../src/lib/mt5/score.ts';

const row = (n, cells) => ({ row: n, cells });

test('mt5Number reads MT5 report values', () => {
  assert.deepEqual(mt5Number('6 231.69 (6.42%)'), { value: 6231.69, paren: 6.42 });
  assert.deepEqual(mt5Number('187 (54.01%)'), { value: 187, paren: 54.01 });
  assert.deepEqual(mt5Number('-4 728.30 (12)'), { value: -4728.3, paren: 12 });
  assert.equal(mt5Number('6.42%').value, 6.42);
  assert.equal(mt5Number('6.0627E-2').value, 0.060627);
  assert.equal(mt5Number('buy').value, null);
});

const sample = [
  row(1, { A: 'Trade History Report' }),
  row(3, { A: 'Account:', D: '123 (USD, Demo)' }),
  row(5, { A: 'Date:', D: '2026.07.01 10:00' }),
  row(6, { A: 'Positions' }),
  row(7, { A: 'Time', B: 'Position', C: 'Symbol', D: 'Type', I: 'Time', K: 'Commission', L: 'Swap', M: 'Profit' }),
  row(8, { A: '2026.05.04 10:00:00', B: '1', C: 'XAUUSD', D: 'buy', K: '0', L: '0', M: '500' }),
  row(9, { A: '2026.06.02 10:00:00', B: '2', C: 'XAUUSD', D: 'sell', K: '0', L: '-10', M: '-200' }),
  row(10, { A: 'Deals' }),
  row(11, { A: 'Time', B: 'Deal', C: 'Symbol', D: 'Type', E: 'Direction', I: 'Commission', J: 'Fee', K: 'Swap', L: 'Profit', M: 'Balance' }),
  row(12, { A: '2026.05.01 09:00:00', B: '10', D: 'balance', L: '10000', M: '10000' }),
  row(13, { A: '2026.05.04 10:00:00', B: '11', C: 'XAUUSD', D: 'buy', E: 'in', L: '0', M: '10000' }),
  row(14, { A: '2026.05.04 12:00:00', B: '12', C: 'XAUUSD', D: 'sell', E: 'out', L: '500', M: '10500' }),
  row(15, { A: '2026.06.02 12:00:00', B: '13', C: 'XAUUSD', D: 'buy', E: 'out', K: '-10', L: '-200', M: '10290' }),
  row(16, { I: '0', L: '10300', M: '10290' }),
  row(17, { A: 'Balance:', D: '10290' }),
  row(18, { A: 'Equity:', D: '10290' }),
  row(19, { A: 'Results' }),
  row(20, { A: 'Total Net Profit:', D: '290', E: 'Gross Profit:', H: '500', I: 'Gross Loss:', L: '-210' }),
  row(21, { A: 'Profit Factor:', D: '2.38' }),
  row(22, { E: 'Profit Trades (% of total):', H: '1 (50.00%)', I: 'Loss Trades (% of total):', L: '1 (50.00%)' }),
];

test('parses deals, balance curve, monthly returns net of deposits, and results', () => {
  const r = parseMt5Report([sample]);
  assert.equal(r.initialBalance, 0);
  assert.equal(r.deposits, 10000);
  assert.equal(r.periodStart, '2026-05-01');
  assert.equal(r.periodEnd, '2026-06-02');
  assert.deepEqual(r.balanceCurve.at(-1), { day: '2026-06-02', balance: 10290 });
  // May: deposit 10,000 is not a return; +500 on it = +5%. June: -210 on 10,500 = -2%.
  assert.deepEqual(
    r.monthlyReturns.map((m) => [m.month, m.returnPct]),
    [
      ['2026-05', 5],
      ['2026-06', -2],
    ],
  );
  assert.equal(r.results.totalNetProfit, 290);
  assert.equal(r.results.profitTradesPct, 50);
  assert.equal(r.swaps, -10);
  assert.deepEqual(r.symbols, [{ symbol: 'XAUUSD', trades: 2, wins: 1, profit: 290 }]);
});

test('rejects files that are not an MT5 trade history report', () => {
  assert.throws(() => parseMt5Report([[row(1, { A: 'Ventas 2026' })]]), Mt5ParseError);
});

const real = process.env.MT5_SAMPLE_XLSX;
test('real MetaTrader 5 Excel report', { skip: !real || !existsSync(real) ? 'MT5_SAMPLE_XLSX no definido' : false }, async () => {
  const { readXlsx } = await import('../src/lib/mt5/xlsx.ts');
  const r = parseMt5Report(readXlsx(new Uint8Array(readFileSync(real))));
  assert.deepEqual(r.warnings, []);
  assert.ok(r.dealsCount > 0 && r.balanceCurve.length > 0);
  // Initial balance + net profit + net deposits = last balance in the deals.
  const last = r.balanceCurve.at(-1).balance;
  assert.ok(Math.abs(r.initialBalance + (r.results.totalNetProfit ?? 0) + r.deposits - r.withdrawals - last) < 1);
  const m = mt5Metrics(r);
  const s = mt5Score(r, m);
  assert.ok(s.score !== null && s.score >= 0 && s.score <= 100);
  assert.ok(Array.isArray(mt5Recommendations(r, m)));
});
