import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { DEPARTMENTS, DEPARTMENT_KEYS, type DepartmentKey } from '../../lib/floorplan';
import { compliance, SCORE_SEGMENTS } from '../../lib/kpis';
import { groupStats, rankInDepartment, statsOfDepartment, type GroupStats, type StationStat } from '../../lib/stats';
import { inputClass, money, SignedMoney, TableFrame, Td, Th } from '../ui';
import { monthLabel } from './MemberPanel';

type Props = {
  stats: StationStat[];
  department: DepartmentKey | null;
  onDepartment: (department: DepartmentKey | null) => void;
  period: string | null;
  periods: string[];
  onPeriod: (period: string) => void;
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  loading: boolean;
};

export function StatsPanels(props: Props) {
  return (
    <div className="space-y-4">
      <DepartmentStats {...props} />
      <SelectedStation {...props} />
      <StationTable {...props} />
    </div>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="glass rounded-xl p-4 sm:p-5 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-mono uppercase tracking-widest text-accent">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink/60">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{children}</div>
      {hint && <div className="text-[10px] text-ink/50 tabular-nums">{hint}</div>}
    </div>
  );
}

/** Score from 0 to 100 as a thin bar with its number. */
function ScoreMeter({ score, color = '#283d8c' }: { score: number | null; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, backgroundColor: color }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums">{score ?? '-'}</span>
    </div>
  );
}

const complianceText = (rate: number | null) => (rate === null ? 'Sin meta' : `${rate}%`);
const complianceClass = (rate: number | null) => (rate === null ? 'text-ink/50' : rate < 100 ? 'text-danger' : 'text-accent');

function DepartmentStats({ stats, department, onDepartment, period, periods, onPeriod, loading }: Props) {
  const group = groupStats(statsOfDepartment(stats, department));
  const title = department ? DEPARTMENTS[department].label : 'Todos los departamentos';

  const periodSelect =
    periods.length > 0 ? (
      <select
        aria-label="Periodo de las estadísticas"
        className={cn(inputClass, 'w-auto py-1 text-xs capitalize')}
        value={period ?? ''}
        onChange={(e) => onPeriod(e.target.value)}
      >
        {periods.map((p) => (
          <option key={p} value={p}>
            {monthLabel(p)}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <Panel title="Estadísticas del departamento" aside={periodSelect}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Departamento">
        <Chip active={department === null} onClick={() => onDepartment(null)}>
          Todos
        </Chip>
        {DEPARTMENT_KEYS.map((key) => (
          <Chip key={key} active={department === key} color={DEPARTMENTS[key].color} onClick={() => onDepartment(key)}>
            {DEPARTMENTS[key].short}
          </Chip>
        ))}
      </div>

      <p className="text-sm font-semibold">
        {title}
        {period && <span className="font-normal text-ink/60 capitalize"> · {monthLabel(period)}</span>}
      </p>

      {loading ? (
        <p className="text-sm text-ink/60">Cargando estadísticas...</p>
      ) : (
        <>
          <GroupTiles group={group} />
          {period === null && <p className="text-xs text-ink/60">Todavía no hay KPIs registrados. Las cifras se llenan al registrar KPIs en los expedientes.</p>}
          <SegmentAverages group={group} />
          {department === null && <DepartmentComparison stats={stats} onDepartment={onDepartment} />}
        </>
      )}
    </Panel>
  );
}

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active ? 'border-accent bg-accent text-bg' : 'border-border text-ink/70 hover:border-accent/60 hover:text-ink',
      )}
    >
      {color && <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

function GroupTiles({ group }: { group: GroupStats }) {
  const occupancy = group.stations ? Math.round((group.occupied / group.stations) * 100) : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Stat label="Ocupación" hint={`${occupancy}% de estaciones`}>
        {group.occupied} / {group.stations}
      </Stat>
      <Stat label="Calificación prom." hint={`${group.reporting} con KPIs`}>
        {group.avgScore ?? '-'}
        {group.avgScore !== null && <span className="text-xs font-normal text-ink/50"> / 100</span>}
      </Stat>
      <Stat label="P&L total">
        <SignedMoney value={group.pnl} />
      </Stat>
      <Stat label="Volumen">{money(group.volume)}</Stat>
      <Stat label="Operaciones">{group.operations}</Stat>
      <Stat label="Cumplimiento" hint={group.goal > 0 ? `${money(group.achieved)} de ${money(group.goal)}` : undefined}>
        <span className={complianceClass(group.compliance)}>{complianceText(group.compliance)}</span>
      </Stat>
      <Stat label="Errores">
        <span className={group.errors > 0 ? 'text-danger' : undefined}>{group.errors}</span>
      </Stat>
      <Stat label="Incidencias">
        <span className={group.incidents > 0 ? 'text-danger' : undefined}>{group.incidents}</span>
      </Stat>
    </div>
  );
}

function SegmentAverages({ group }: { group: GroupStats }) {
  if (group.reporting === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Promedio por componente</h4>
      <ul className="space-y-1.5">
        {SCORE_SEGMENTS.map((segment) => (
          <li key={segment.key} className="grid grid-cols-[8rem_1fr] items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 truncate text-ink/70">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <ScoreMeter score={group.avgSegments[segment.key]} color={segment.color} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DepartmentComparison({ stats, onDepartment }: { stats: StationStat[]; onDepartment: (department: DepartmentKey) => void }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Comparación por departamento</h4>
      <ul className="space-y-1">
        {DEPARTMENT_KEYS.map((key) => {
          const group = groupStats(statsOfDepartment(stats, key));
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onDepartment(key)}
                className="grid w-full grid-cols-[8rem_1fr_6.5rem] items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-border/30"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: DEPARTMENTS[key].color }} />
                  {DEPARTMENTS[key].short}
                </span>
                <ScoreMeter score={group.avgScore} color={DEPARTMENTS[key].color} />
                <span className="text-right font-mono tabular-nums">
                  <SignedMoney value={group.pnl} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SelectedStation({ stats, selectedStationId, period, loading }: Props) {
  const stat = stats.find((s) => s.station.id === selectedStationId);
  if (!stat) {
    return (
      <Panel title="Puesto seleccionado">
        <p className="text-sm text-ink/60">Selecciona una estación en el plano o en la tabla para ver sus estadísticas.</p>
      </Panel>
    );
  }

  const department = DEPARTMENTS[stat.station.department];
  const peers = groupStats(statsOfDepartment(stats, stat.station.department));
  const rank = rankInDepartment(stats, stat.station.id);
  const diff = stat.score !== null && peers.avgScore !== null ? Math.round((stat.score - peers.avgScore) * 10) / 10 : null;
  const rate = stat.record ? compliance(stat.record) : null;

  return (
    <Panel title="Puesto seleccionado">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: department.color }} />
        <div>
          <p className="text-sm font-semibold">
            Estación {stat.station.id}
            <span className="font-normal text-ink/60"> · {department.short}</span>
          </p>
          <p className="text-xs text-ink/70">
            {stat.member ? `${stat.member.name}${stat.member.role ? ` · ${stat.member.role}` : ''}` : 'Estación vacía'}
          </p>
        </div>
      </div>

      {loading ? null : !stat.member ? (
        <p className="text-sm text-ink/60">Sin miembro asignado. Asígnalo desde el expediente debajo del plano.</p>
      ) : !stat.record ? (
        <p className="text-sm text-ink/60">Sin KPIs registrados{period ? ` en ${monthLabel(period)}` : ''}.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat
            label="Calificación"
            hint={diff === null ? undefined : `${diff >= 0 ? '+' : ''}${diff} vs prom. depto.`}
          >
            {stat.score}
            <span className="text-xs font-normal text-ink/50"> / 100</span>
          </Stat>
          <Stat label="Posición en depto." hint={rank ? `de ${rank.of} con KPIs` : undefined}>
            {rank ? `#${rank.rank}` : '-'}
          </Stat>
          <Stat label="P&L">
            <SignedMoney value={stat.record.pnl} />
          </Stat>
          <Stat label="Cumplimiento">
            <span className={complianceClass(rate)}>{complianceText(rate)}</span>
          </Stat>
          <Stat label="Operaciones" hint={`Volumen ${money(stat.record.volume)}`}>
            {stat.record.operationsCount}
          </Stat>
          <Stat label="Errores + inc.">
            <span className={stat.record.errors + stat.record.incidents > 0 ? 'text-danger' : undefined}>
              {stat.record.errors + stat.record.incidents}
            </span>
          </Stat>
        </div>
      )}
    </Panel>
  );
}

function StationTable({ stats, department, selectedStationId, onSelectStation }: Props) {
  // Only active workstations (with a member) are listed.
  const rows = statsOfDepartment(stats, department).filter((s) => s.member);
  return (
    <Panel title="Puestos de trabajo" aside={<span className="text-[11px] text-ink/60">{rows.length} activos</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">No hay puestos activos{department ? ' en este departamento' : ''}.</p>
      ) : (
      <TableFrame>
        <thead>
          <tr className="border-b border-border">
            <Th>Puesto</Th>
            <Th>Miembro</Th>
            <Th>Calificación</Th>
            <Th right>P&L</Th>
            <Th right>Cumpl.</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ station, member, record, score }) => {
            const rate = record ? compliance(record) : null;
            const selected = station.id === selectedStationId;
            return (
              <tr
                key={station.id}
                tabIndex={0}
                aria-current={selected || undefined}
                onClick={() => onSelectStation(station.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onSelectStation(station.id);
                }}
                className={cn(
                  'cursor-pointer border-b border-border last:border-0 outline-none hover:bg-border/30 focus-visible:bg-border/40',
                  selected && 'bg-border/40',
                )}
              >
                <Td className="whitespace-nowrap font-mono">
                  <span className="mr-1.5 inline-block size-2 rounded-sm align-middle" style={{ backgroundColor: DEPARTMENTS[station.department].color }} />
                  {station.id}
                </Td>
                <Td className="max-w-[9rem] truncate">{member?.name}</Td>
                <Td className="min-w-[7rem]">{record ? <ScoreMeter score={score} /> : <span className="text-ink/40">-</span>}</Td>
                <Td right>{record ? <SignedMoney value={record.pnl} /> : '-'}</Td>
                <Td right>{record ? <span className={complianceClass(rate)}>{complianceText(rate)}</span> : '-'}</Td>
              </tr>
            );
          })}
        </tbody>
      </TableFrame>
      )}
    </Panel>
  );
}
