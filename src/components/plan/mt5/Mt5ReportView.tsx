import { cn } from '../../../lib/cn';
import type { Mt5ReportDetail } from '../../../lib/mt5/types';
import { money, SignedMoney, TableFrame, Td, Th } from '../../ui';
import { MonthlyReturnsChart, NavChart } from '../ib/IbCharts';
import { Block, SEVERITY, Stat } from '../ib/IbReportSection';

const pct = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? '-' : `${v.toFixed(digits)}%`);
const signedPct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
const plain = (v: number | null | undefined) => (v === null || v === undefined ? '-' : money(v));
const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Dashboard of a MetaTrader 5 Trade History Report: score, results, balance graph, months, symbols. */
export function Mt5ReportView({ report }: { report: Mt5ReportDetail }) {
  const d = report.data;
  const r = d.results;
  const s = d.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
        <div className="text-xs text-ink/70">
          <p className="text-sm font-semibold text-ink">
            MetaTrader 5 · {d.accountName || 'Cuenta'} · {d.account}
          </p>
          <p>{d.company}</p>
          <p>
            Operaciones del {date(d.periodStart)} al {date(d.periodEnd)} · {d.dealsCount} deals · {report.fileName}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Puntuación operativa {report.metrics.month}</div>
          <div className="text-2xl font-semibold tabular-nums">
            {report.score ?? '-'}
            <span className="text-sm text-ink/50"> / 100</span>
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {report.scoreParts.map((part) => (
          <li key={part.key} className="rounded-lg border border-border px-3 py-2 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">
                {part.label} <span className="font-normal text-ink/50">· peso {Math.round(part.weight * 100)}%</span>
              </span>
              <span className="tabular-nums font-semibold">{part.score ?? '-'}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${part.score ?? 0}%` }} />
            </div>
            <p className="mt-1 text-ink/60">{part.detail}</p>
          </li>
        ))}
      </ul>

      {report.recommendations.length > 0 && (
        <Block title="Recomendaciones">
          <ul className="space-y-1.5">
            {report.recommendations.map((rec) => {
              const sev = SEVERITY[rec.severity];
              const Icon = sev.icon;
              return (
                <li key={rec.code} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', sev.className)}>
                  <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">{sev.label}: </span>
                    {rec.message}
                  </span>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      <Block title="Rendimiento">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Balance inicial">{plain(d.initialBalance)}</Stat>
          <Stat label="Balance">{plain(s.balance)}</Stat>
          <Stat label="Equity" hint={s.floatingPnl !== null ? `Flotante ${money(s.floatingPnl)}` : undefined}>
            {plain(s.equity)}
          </Stat>
          <Stat label="Beneficio neto">
            <SignedMoney value={r.totalNetProfit ?? 0} />
          </Stat>
          <Stat label="Retorno del periodo">{signedPct(d.totalReturnPct)}</Stat>
          <Stat label="Año (YTD)" hint={`Esperado ${pct(report.metrics.dueGoalPct, 1)} (meta 25% anual)`}>
            {signedPct(d.ytdPct)}
          </Stat>
          <Stat label="Beneficio / pérdida bruta" hint={`${plain(r.grossProfit)} / ${plain(r.grossLoss)}`}>
            PF {r.profitFactor?.toFixed(2) ?? '-'}
          </Stat>
          <Stat label="Comisiones + swaps">{plain(d.commissions + d.swaps + d.fees)}</Stat>
        </div>
      </Block>

      <Block title="Resultados (Results)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Operaciones" hint={`${r.longTrades ?? '-'} largas · ${r.shortTrades ?? '-'} cortas`}>
            {r.totalTrades ?? '-'}
          </Stat>
          <Stat label="Ganadoras" hint={`${r.profitTrades ?? '-'} de ${r.totalTrades ?? '-'}`}>
            {pct(r.profitTradesPct)}
          </Stat>
          <Stat label="Acierto largas / cortas">
            {pct(r.longWonPct, 1)} / {pct(r.shortWonPct, 1)}
          </Stat>
          <Stat label="Expected payoff">{plain(r.expectedPayoff)}</Stat>
          <Stat label="Drawdown máximo" hint={r.balanceDrawdownMaximal !== null ? money(r.balanceDrawdownMaximal) : undefined}>
            {pct(r.balanceDrawdownRelativePct ?? r.balanceDrawdownMaximalPct)}
          </Stat>
          <Stat label="Recovery factor">{r.recoveryFactor?.toFixed(2) ?? '-'}</Stat>
          <Stat label="Ganancia / pérdida media">
            {plain(r.averageProfitTrade)} / {plain(r.averageLossTrade)}
          </Stat>
          <Stat label="Mayor ganancia / pérdida">
            {plain(r.largestProfitTrade)} / {plain(r.largestLossTrade)}
          </Stat>
          <Stat label="Rachas máx. (gan / pérd)">
            {r.maxConsecutiveWins ?? '-'} / {r.maxConsecutiveLosses ?? '-'}
          </Stat>
          <Stat label="Sharpe">{r.sharpeRatio?.toFixed(2) ?? '-'}</Stat>
          <Stat label="Margen libre">{plain(s.freeMargin)}</Stat>
          <Stat label="Depósitos / retiros">
            {plain(d.deposits)} / {plain(d.withdrawals)}
          </Stat>
        </div>
      </Block>

      <Block title="Gráfico de balance">
        <NavChart days={d.balanceCurve.map((p) => ({ day: p.day, nav: p.balance, byClass: {} }))} currency="USD" />
      </Block>

      <Block title="Retorno mensual">
        <MonthlyReturnsChart months={d.monthlyReturns.map((m) => ({ month: m.month, account: m.returnPct, benchmarks: {} }))} />
      </Block>

      <Block title={`Resultado por símbolo (${d.symbols.length})`}>
        <TableFrame>
          <thead>
            <tr className="border-b border-border">
              <Th>Símbolo</Th>
              <Th right>Operaciones</Th>
              <Th right>Acierto</Th>
              <Th right>Resultado</Th>
            </tr>
          </thead>
          <tbody>
            {d.symbols.map((sym) => (
              <tr key={sym.symbol} className="border-b border-border last:border-0">
                <Td className="font-mono">{sym.symbol}</Td>
                <Td right>{sym.trades}</Td>
                <Td right>{sym.trades ? pct((sym.wins / sym.trades) * 100, 1) : '-'}</Td>
                <Td right>
                  <SignedMoney value={sym.profit} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </Block>

      {d.openPositions.length > 0 && (
        <Block title={`Posiciones abiertas (${d.openPositions.length})`}>
          <TableFrame>
            <thead>
              <tr className="border-b border-border">
                <Th>Símbolo</Th>
                <Th>Tipo</Th>
                <Th right>Volumen</Th>
                <Th right>Apertura</Th>
                <Th right>Mercado</Th>
                <Th right>Swap</Th>
                <Th right>Flotante</Th>
              </tr>
            </thead>
            <tbody>
              {d.openPositions.map((p, i) => (
                <tr key={`${p.symbol}-${i}`} className="border-b border-border last:border-0">
                  <Td className="font-mono">{p.symbol}</Td>
                  <Td>{p.type}</Td>
                  <Td right>{p.volume ?? '-'}</Td>
                  <Td right>{plain(p.openPrice)}</Td>
                  <Td right>{plain(p.marketPrice)}</Td>
                  <Td right>{plain(p.swap)}</Td>
                  <Td right>{p.profit === null ? '-' : <SignedMoney value={p.profit} />}</Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </Block>
      )}

      {d.warnings.length > 0 && <p className="rounded-lg border border-border px-3 py-2 text-xs text-ink/60">Avisos de lectura: {d.warnings.join(' · ')}</p>}
    </div>
  );
}
