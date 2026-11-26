import { AlertOctagon, AlertTriangle, Info, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../../lib/apiClient';
import { cn } from '../../../lib/cn';
import type { Recommendation } from '../../../lib/ib/score';
import type { IbReportDetail, IbReportListItem } from '../../../lib/ib/types';
import type { Mt5ReportDetail, Mt5ReportListItem } from '../../../lib/mt5/types';
import { Mt5ReportView } from '../mt5/Mt5ReportView';
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from '../../../lib/storage';
import { supabase } from '../../../lib/supabase';
import { money, rowAction, secondaryButton, SignedMoney, TableFrame, Td, Th } from '../../ui';
import { AllocationBars, MonthlyReturnsChart, NavChart } from './IbCharts';

type Props = { memberId: string; onError: (error: unknown) => void; onScored: () => Promise<void> };

const date = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';
const pct = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? '-' : `${v.toFixed(digits)}%`);
const signedPct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
const plain = (v: number | null | undefined) => (v === null || v === undefined ? '-' : money(v));

type Kind = 'ib' | 'mt5';
type ListEntry = { kind: Kind; id: string; period: string; fileName: string; score: number | null };
const keyOf = (e: Pick<ListEntry, 'kind' | 'id'>) => `${e.kind}:${e.id}`;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function IbReportSection({ memberId, onError, onScored }: Props) {
  const [reports, setReports] = useState<ListEntry[] | null>(null);
  /** "ib:<id>" or "mt5:<id>". */
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<IbReportDetail | null>(null);
  const [mt5Detail, setMt5Detail] = useState<Mt5ReportDetail | null>(null);
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    try {
      const [ib, mt5] = await Promise.all([
        api<{ reports: IbReportListItem[] }>(`/api/members/${memberId}/ib-reports`),
        api<{ reports: Mt5ReportListItem[] }>(`/api/members/${memberId}/mt5-reports`),
      ]);
      const list: ListEntry[] = [
        ...ib.reports.map((r) => ({ kind: 'ib' as const, id: r.id, period: r.period, fileName: r.fileName, score: r.score })),
        ...mt5.reports.map((r) => ({ kind: 'mt5' as const, id: r.id, period: r.period, fileName: r.fileName, score: r.score })),
      ].sort((a, b) => b.period.localeCompare(a.period));
      setReports(list);
      setSelected((current) => (current && list.some((r) => keyOf(r) === current) ? current : list[0] ? keyOf(list[0]) : null));
    } catch (e) {
      onError(e);
    }
  }, [memberId, onError]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setMt5Detail(null);
      return;
    }
    let active = true;
    const [kind, id] = selected.split(':') as [Kind, string];
    // The server rescores old reports with the current goals; keep the list and the KPIs in step.
    const sync = (score: number | null) =>
      setReports((list) => {
        const stale = list?.some((r) => keyOf(r) === selected && r.score !== score);
        if (stale) void onScored();
        return list?.map((r) => (keyOf(r) === selected ? { ...r, score } : r)) ?? list;
      });
    if (kind === 'ib') {
      api<IbReportDetail>(`/api/reports/${id}`)
        .then((d) => {
          if (!active) return;
          setDetail(d);
          sync(d.score);
        })
        .catch(onError);
    } else {
      api<Mt5ReportDetail>(`/api/mt5-reports/${id}`)
        .then((d) => {
          if (!active) return;
          setMt5Detail(d);
          sync(d.score);
        })
        .catch(onError);
    }
    return () => {
      active = false;
    };
  }, [selected, onError, onScored]);

  async function upload(file: File) {
    const isPdf = /\.pdf$/i.test(file.name);
    if (!isPdf && !/\.xlsx$/i.test(file.name)) throw new Error('Sube el PDF de Interactive Brokers o el Excel (.xlsx) de MetaTrader 5');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('El archivo supera el máximo de 50 MB');
    if (!supabase) throw new Error('Falta configurar las claves públicas de Supabase');
    setStatus('Subiendo el archivo...');
    const { path, token, kind } = await api<{ path: string; token: string; kind: Kind }>(`/api/members/${memberId}/ib-reports/upload-url`, 'POST', {
      name: file.name,
      size: file.size,
    });
    const { error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .uploadToSignedUrl(path, token, file, { contentType: isPdf ? 'application/pdf' : XLSX_TYPE });
    if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
    setStatus('Leyendo el informe...');
    const saved = await api<{ id: string }>(`/api/members/${memberId}/${kind === 'ib' ? 'ib-reports' : 'mt5-reports'}`, 'POST', { path, name: file.name });
    await loadList();
    setSelected(keyOf({ kind, id: saved.id }));
    await onScored();
  }

  async function onFile(file: File) {
    try {
      await upload(file);
    } catch (e) {
      onError(e);
    } finally {
      setStatus('');
    }
  }

  async function remove(report: ListEntry) {
    if (!window.confirm(`¿Borrar el informe ${report.kind === 'ib' ? 'de Interactive Brokers' : 'de MetaTrader 5'} de ${report.period} (${report.fileName})?`)) return;
    try {
      await api(report.kind === 'ib' ? `/api/reports/${report.id}` : `/api/mt5-reports/${report.id}`, 'DELETE');
      await loadList();
      await onScored();
    } catch (e) {
      onError(e);
    }
  }

  const [selectedKind, selectedId] = (selected ?? ':').split(':');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink/60">Informes de Interactive Brokers y MetaTrader 5</span>
        <button type="button" className={cn(secondaryButton, 'flex items-center gap-1.5')} disabled={Boolean(status)} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" aria-hidden />
          {status || 'Subir informe (PDF IB o Excel MT5)'}
        </button>
        <input
          ref={input}
          type="file"
          accept={`application/pdf,.pdf,${XLSX_TYPE},.xlsx`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onFile(file);
          }}
        />
      </div>
      <p className="text-xs text-ink/60">
        Sube el informe <span className="font-semibold">PortfolioAnalyst</span> de Interactive Brokers (PDF) o el{' '}
        <span className="font-semibold">Trade History Report</span> de MetaTrader 5 exportado a Excel (.xlsx), con cualquier nombre. Se leen
        automáticamente; si en un mes hay de los dos, el KPI de resultados operativos es el promedio de ambos.
      </p>

      {reports === null ? (
        <p className="text-sm text-ink/60">Cargando informes...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-ink/60">Todavía no hay informes.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Informes">
          {reports.map((r) => (
            <span key={keyOf(r)} className="flex items-center">
              <button
                type="button"
                onClick={() => setSelected(keyOf(r))}
                aria-pressed={selected === keyOf(r)}
                className={cn(
                  'rounded-l-full border px-2.5 py-1 text-[11px] tabular-nums',
                  selected === keyOf(r) ? 'border-accent bg-accent text-bg' : 'border-border text-ink/70 hover:border-accent/60',
                )}
              >
                <span className="font-semibold">{r.kind === 'ib' ? 'IB' : 'MT5'}</span> · {r.period} · {r.score ?? '-'} pts
              </button>
              <button type="button" onClick={() => void remove(r)} className={cn(rowAction, 'rounded-r-full border border-l-0 border-border px-1.5 py-1')} aria-label={`Borrar informe ${r.period}`}>
                <Trash2 className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {selectedKind === 'ib' && detail && detail.id === selectedId && <ReportView report={detail} />}
      {selectedKind === 'mt5' && mt5Detail && mt5Detail.id === selectedId && <Mt5ReportView report={mt5Detail} />}
    </div>
  );
}

export function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink/60">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{children}</div>
      {hint && <div className="text-[10px] text-ink/50">{hint}</div>}
    </div>
  );
}

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h5 className="text-[10px] font-mono uppercase tracking-wider text-ink/60">{title}</h5>
      {children}
    </section>
  );
}

export const SEVERITY: Record<Recommendation['severity'], { label: string; icon: typeof Info; className: string }> = {
  critico: { label: 'Crítico', icon: AlertOctagon, className: 'border-red-300 bg-red-50 text-red-900' },
  aviso: { label: 'Aviso', icon: AlertTriangle, className: 'border-amber-300 bg-amber-50 text-amber-900' },
  info: { label: 'Info', icon: Info, className: 'border-border bg-surface text-ink' },
};

function ReportView({ report }: { report: IbReportDetail }) {
  const { summary, returns, risk, metrics, scoreParts } = report.analytics;
  const accountRisk = risk.account;
  const spx = returns.benchmarks.SPXTR;
  const holdings = report.positions.filter((p) => p.assetClass !== 'Cash').sort((a, b) => Math.abs(b.baseValue ?? 0) - Math.abs(a.baseValue ?? 0));
  const ranked = report.symbols.filter((s) => s.contributionPct !== null).sort((a, b) => (b.contributionPct ?? 0) - (a.contributionPct ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
        <div className="text-xs text-ink/70">
          <p className="text-sm font-semibold text-ink">
            {report.accountName || 'Cuenta'} · {report.accountId}
          </p>
          <p>{report.accountType}</p>
          <p>
            Periodo: {date(report.periodStart)} - {date(report.periodEnd)} · {report.baseCurrency} · {report.fileName}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Puntuación operativa {metrics.month}</div>
          <div className="text-2xl font-semibold tabular-nums">
            {report.score ?? '-'}
            <span className="text-sm text-ink/50"> / 100</span>
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {scoreParts.map((part) => (
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
            {report.recommendations.map((r) => {
              const s = SEVERITY[r.severity];
              const Icon = s.icon;
              return (
                <li key={r.code} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', s.className)}>
                  <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">{s.label}: </span>
                    {r.message}
                  </span>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      <Block title="Rendimiento del periodo">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="NAV inicial">{plain(summary.navStart)}</Stat>
          <Stat label="NAV final">{plain(summary.navEnd)}</Stat>
          <Stat label="Cambio NAV">
            <SignedMoney value={summary.changeInNav ?? 0} />
          </Stat>
          <Stat label="Retorno acumulado" hint={spx?.ytd != null ? `S&P 500 YTD ${signedPct(spx.ytd)}` : undefined}>
            {signedPct(summary.cumulativeReturnPct)}
          </Stat>
          <Stat label="Mes en curso (MTD)" hint={spx?.mtd != null ? `S&P 500 ${signedPct(spx.mtd)}` : undefined}>
            {signedPct(returns.account?.mtd)}
          </Stat>
          <Stat label="Año (YTD)">{signedPct(returns.account?.ytd)}</Stat>
          <Stat label="12 meses">{signedPct(returns.account?.oneYear)}</Stat>
          <Stat label="Desde inicio">{signedPct(returns.account?.sinceInception)}</Stat>
          <Stat label="MTM">
            <SignedMoney value={summary.mtm ?? 0} />
          </Stat>
          <Stat label="Dividendos + intereses">{plain((summary.dividends ?? 0) + (summary.interest ?? 0))}</Stat>
          <Stat label="Comisiones">{plain(summary.feesCommissions)}</Stat>
          <Stat label="Depósitos / retiros">{plain(summary.depositsWithdrawals)}</Stat>
        </div>
      </Block>

      <Block title="Riesgo y operaciones">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Caída máxima" hint={accountRisk?.peakToValley ?? undefined}>
            {pct(accountRisk?.maxDrawdownPct)}
          </Stat>
          <Stat label="Sharpe / Sortino">
            {accountRisk?.sharpe ?? '-'} / {accountRisk?.sortino ?? '-'}
          </Stat>
          <Stat label="Desviación estándar">{pct(accountRisk?.stdDevPct)}</Stat>
          <Stat label="Días positivos">{pct(accountRisk?.positivePeriodsPct)}</Stat>
          <Stat label="Win rate" hint={`${metrics.closedPositions} posiciones cerradas`}>
            {pct(metrics.winRatePct, 1)}
          </Stat>
          <Stat label="Profit factor">{metrics.profitFactor ?? '-'}</Stat>
          <Stat label="P&L realizado">
            <SignedMoney value={metrics.realizedPnl} />
          </Stat>
          <Stat label="Símbolos operados">{metrics.tradedSymbols}</Stat>
        </div>
      </Block>

      <Block title={`NAV diario (${report.baseCurrency})`}>
        <NavChart days={report.navDaily} currency={report.baseCurrency} />
      </Block>

      <Block title="Retorno mensual frente al S&P 500">
        <MonthlyReturnsChart months={report.monthlyReturns} />
      </Block>

      <Block title="Distribución del portafolio por tipo de activo">
        <AllocationBars day={report.navDaily.at(-1)} currency={report.baseCurrency} />
      </Block>

      <Block title={`Posiciones abiertas (${holdings.length})`}>
        <TableFrame>
          <thead>
            <tr className="border-b border-border">
              <Th>Símbolo</Th>
              <Th>Tipo</Th>
              <Th right>Cantidad</Th>
              <Th right>Valor</Th>
              <Th right>Peso</Th>
              <Th right>P&L no realizado</Th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((p) => (
              <tr key={`${p.assetClass}-${p.symbol}`} className="border-b border-border last:border-0">
                <Td className="whitespace-nowrap">
                  <span className="font-mono">{p.symbol}</span>
                  {p.sector && <span className="block text-[10px] text-ink/50">{p.sector}</span>}
                </Td>
                <Td className="text-ink/70">{p.assetClass}</Td>
                <Td right>{p.quantity ?? '-'}</Td>
                <Td right>{plain(p.baseValue)}</Td>
                <Td right>{pct(p.weightPct)}</Td>
                <Td right>{p.unrealizedPnl === null ? '-' : <SignedMoney value={p.unrealizedPnl} />}</Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </Block>

      <Block title="Mejores y peores contribuciones">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: 'Mejores', list: ranked.slice(0, 5) },
            { title: 'Peores', list: ranked.slice(-5).reverse() },
          ].map(({ title, list }) => (
            <div key={title} className="space-y-1">
              <p className="text-xs font-semibold">{title}</p>
              <ul className="divide-y divide-border rounded-lg border border-border text-xs">
                {list.map((s) => (
                  <li key={`${title}-${s.symbol}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="truncate font-mono">{s.symbol}</span>
                    <span className="shrink-0 tabular-nums">
                      {signedPct(s.contributionPct)} · <SignedMoney value={(s.realizedPnl ?? 0) + (s.unrealizedPnl ?? 0)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Block>

      <details className="space-y-2">
        <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-ink/60 hover:text-ink">
          Resumen de operaciones ({report.trades.length} símbolos)
        </summary>
        <div className="mt-2 max-h-80 overflow-auto">
          <TableFrame>
            <thead>
              <tr className="border-b border-border">
                <Th>Símbolo</Th>
                <Th>Tipo</Th>
                <Th right>Comprado</Th>
                <Th right>Importe compra</Th>
                <Th right>Vendido</Th>
                <Th right>Importe venta</Th>
              </tr>
            </thead>
            <tbody>
              {report.trades.map((t, i) => (
                <tr key={`${t.symbol}-${i}`} className="border-b border-border last:border-0">
                  <Td className="whitespace-nowrap font-mono">{t.symbol}</Td>
                  <Td className="text-ink/70">
                    {t.assetClass} {t.currency && `(${t.currency})`}
                  </Td>
                  <Td right>{t.boughtQty ?? '-'}</Td>
                  <Td right>{plain(t.boughtProceeds)}</Td>
                  <Td right>{t.soldQty ?? '-'}</Td>
                  <Td right>{plain(t.soldProceeds)}</Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </div>
      </details>

      {report.warnings.length > 0 && (
        <p className="rounded-lg border border-border px-3 py-2 text-xs text-ink/60">Avisos de lectura: {report.warnings.join(' · ')}</p>
      )}
    </div>
  );
}
