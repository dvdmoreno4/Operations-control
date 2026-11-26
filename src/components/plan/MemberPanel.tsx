import { FolderKanban, Gauge, Inbox, Monitor, Sparkles, TrendingUp } from 'lucide-react';
import { SCREEN_HOURS_GOAL } from '../../lib/goals';
import { ScreenTimeSection } from './ScreenTimeSection';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../lib/apiClient';
import { DEPARTMENT_KEYS, DEPARTMENTS, STATIONS, findStation } from '../../lib/floorplan';
import {
  centralScore,
  compliance,
  EMPTY_KPIS,
  memberDepartment,
  SCORE_SEGMENTS,
  totalScore,
  type KpiRecord,
  type KpiValues,
  type Member,
} from '../../lib/kpis';
import { Collapsible, Field, inputClass, money, primaryButton, secondaryButton, SignedMoney, SignedPercent, TableFrame, Td, Th } from '../ui';
import { ActivitiesSection } from './ActivitiesSection';
import { IbReportSection } from './ib/IbReportSection';
import { ProjectsSection } from './ProjectsSection';
import { RequestsSection } from './RequestsSection';
import { ScoreBar } from './ScoreBar';
import { SemesterProgress } from './StatsPanels';
import { cn } from '../../lib/cn';
import { average, monthsOf, semesterLabel, semesterOf } from '../../lib/semester';

type Shared = { onChanged: () => Promise<void>; onError: (error: unknown) => void };

const currentMonth = () => new Date().toISOString().slice(0, 7);

export const monthLabel = (period: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function MemberPanel({
  stationId,
  member,
  members,
  admin,
  ...shared
}: Shared & { stationId: string | null; member: Member | undefined; members: Member[]; admin: boolean }) {
  if (!stationId) {
    return (
      <section className="glass rounded-xl p-6 text-sm text-ink/60">
        Haz clic en una estación de computadora del plano para consultar su expediente.
      </section>
    );
  }
  const station = findStation(stationId);
  const departmentKey = member ? memberDepartment(member) : station?.department;
  const department = departmentKey ? DEPARTMENTS[departmentKey] : null;

  return (
    <section className="glass rounded-xl p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-ink/60">
        <span className="size-2.5 rounded-sm" style={{ backgroundColor: department?.color }} />
        {department?.label} · Estación {stationId}
      </header>
      {member ? (
        <MemberFile key={member.id} member={member} members={members} admin={admin} {...shared} />
      ) : (
        <AssignForm key={stationId} stationId={stationId} {...shared} />
      )}
    </section>
  );
}

function AssignForm({ stationId, onChanged, onError }: Shared & { stationId: string }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/members', 'POST', { stationId, name, role });
      await onChanged();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm">
        <span className="inline-block size-2.5 rounded-full bg-slate-400 blur-[1px] mr-2 align-middle" />
        Estación vacía. Asigna un miembro para abrir su expediente.
      </p>
      <Field label="Nombre">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </Field>
      <Field label="Cargo">
        <input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
      </Field>
      <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
        {busy ? 'Guardando...' : 'Asignar miembro'}
      </button>
    </form>
  );
}

function MemberFile({ member, members, admin, onChanged, onError }: Shared & { member: Member; members: Member[]; admin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [records, setRecords] = useState<KpiRecord[] | null>(null);
  const [period, setPeriod] = useState(member.latestPeriod ?? currentMonth());

  const loadRecords = useCallback(async () => {
    try {
      setRecords((await api<{ records: KpiRecord[] }>(`/api/members/${member.id}/kpis`)).records);
    } catch (e) {
      onError(e);
    }
  }, [member.id, onError]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  async function remove() {
    if (!window.confirm(`¿Quitar a ${member.name} de la estación ${member.stationId}? Se borran también sus KPIs.`)) return;
    try {
      await api(`/api/members/${member.id}`, 'DELETE');
      await onChanged();
    } catch (e) {
      onError(e);
    }
  }

  const record = records?.find((r) => r.period === period);
  const values: KpiValues & { scoreCollab?: number } = record ?? EMPTY_KPIS;
  const refresh = async () => {
    await loadRecords();
    await onChanged();
  };
  const scoreChip = (score: number | null | undefined) => (
    <span className="rounded-full bg-border/50 px-2 py-0.5 font-semibold tabular-nums text-ink">{record ? `${score ?? 0} / 100` : 'Sin datos'}</span>
  );

  return (
    <div className="space-y-4">
      {editing ? (
        <EditMember member={member} members={members} onDone={() => setEditing(false)} onChanged={onChanged} onError={onError} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{member.name}</h2>
            {member.role && <p className="text-xs text-ink/60">{member.role}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink/60">
              Mes
              <input
                className={cn(inputClass, 'w-auto py-1 text-xs')}
                type="month"
                value={period}
                onChange={(e) => e.target.value && setPeriod(e.target.value)}
              />
            </label>
            <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
              Editar
            </button>
            <button type="button" className={`${secondaryButton} hover:text-danger`} onClick={() => void remove()}>
              Quitar
            </button>
          </div>
        </div>
      )}

      {records === null ? (
        <p className="text-sm text-ink/60">Cargando expediente...</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <SemesterKpi records={records} period={period} onSelect={setPeriod} />
          </div>
          <MonthSummary values={values} period={period} hasRecord={Boolean(record)} />
        </div>
      )}

      <div className="space-y-2">
        <Collapsible title="KPI del mes: detalle y registro" icon={Gauge} summary={scoreChip(totalScore(values))}>
          {records === null ? (
            <p className="text-sm text-ink/60">Cargando...</p>
          ) : (
            <div className="space-y-5">
              <ScoreBar values={values} />
              {record ? <KpiTiles record={record} /> : <p className="text-sm text-ink/60">Sin KPIs registrados para {monthLabel(period)}.</p>}
              <KpiForm
                key={`${member.id}-${period}-${records.length}`}
                memberId={member.id}
                period={period}
                initial={values}
                onSaved={refresh}
                onError={onError}
              />
              <History records={records} selected={period} onSelect={setPeriod} />
            </div>
          )}
        </Collapsible>

        <Collapsible title="Resultados operativos · IB y MetaTrader 5" icon={TrendingUp} summary={scoreChip(record?.scoreOperational)}>
          <IbReportSection memberId={member.id} onError={onError} onScored={refresh} />
        </Collapsible>

        <Collapsible
          title="Tiempo en pantalla"
          icon={Monitor}
          summary={
            <span className="rounded-full bg-border/50 px-2 py-0.5 font-semibold tabular-nums text-ink">
              {record?.screenHours ?? 0} / {SCREEN_HOURS_GOAL} h
            </span>
          }
        >
          {records === null ? (
            <p className="text-sm text-ink/60">Cargando...</p>
          ) : (
            <ScreenTimeSection key={period} memberId={member.id} period={period} records={records} onSaved={refresh} onError={onError} />
          )}
        </Collapsible>

        <Collapsible title="Proyectos" icon={FolderKanban} summary={scoreChip(record?.scoreProjects)}>
          <ProjectsSection memberId={member.id} period={period} admin={admin} members={members} onScoreChanged={refresh} onError={onError} />
        </Collapsible>

        <Collapsible
          title="Actividades extraordinarias"
          icon={Sparkles}
          summary={
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-semibold tabular-nums',
                values.scoreExtra < 0 ? 'bg-red-50 text-danger' : values.scoreExtra > 0 ? 'bg-violet-50 text-violet-700' : 'bg-border/50 text-ink',
              )}
            >
              {values.scoreExtra > 0 ? '+' : values.scoreExtra < 0 ? '−' : '±'}
              {Math.abs(values.scoreExtra)} pts
            </span>
          }
        >
          <ActivitiesSection memberId={member.id} period={period} admin={admin} onScoreChanged={refresh} onError={onError} />
        </Collapsible>

        <Collapsible
          title="Solicitudes y recomendaciones"
          icon={Inbox}
          summary={
            member.pendingRequests > 0 ? (
              <span className="rounded-full bg-red-600 px-2 py-0.5 font-semibold text-white">{member.pendingRequests} pendientes</span>
            ) : (
              <span className="text-ink/50">Sin pendientes</span>
            )
          }
        >
          <RequestsSection memberId={member.id} admin={admin} onChanged={onChanged} onError={onError} />
        </Collapsible>
      </div>
    </div>
  );
}

/** Monthly KPI at a glance: total, central KPI, each segment, the activities adjustment and the collaboration bonus. */
function MonthSummary({ values, period, hasRecord }: { values: KpiValues & { scoreCollab?: number }; period: string; hasRecord: boolean }) {
  const total = totalScore(values);
  const central = centralScore(values);
  const extra = values.scoreExtra;
  const collab = values.scoreCollab ?? 0;
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-mono uppercase tracking-widest text-accent">
          KPI mensual · <span className="capitalize">{monthLabel(period)}</span>
        </h4>
        <span className="text-2xl font-semibold tabular-nums">
          {hasRecord ? total : '-'}
          <span className="text-sm text-ink/50"> / 100</span>
        </span>
      </div>
      <ul className="space-y-1.5 text-xs">
        {SCORE_SEGMENTS.map((segment) => (
          <li key={segment.key} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2">
            <span className="flex items-center gap-1.5 truncate text-ink/70">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/60" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${values[segment.key]}%`, backgroundColor: segment.color }} />
            </div>
            <span className="text-right font-semibold tabular-nums">{values[segment.key]}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border pt-2 text-[11px] text-ink/60">
        KPI central {central}
        {extra !== 0 && (
          <span className={cn('font-semibold', extra < 0 ? 'text-danger' : 'text-violet-700')}>
            {' '}
            {extra > 0 ? '+' : '−'} {Math.abs(extra)} actividades extraordinarias
          </span>
        )}
        {collab > 0 && <span className="font-semibold text-sky-700"> + {collab} colaboración en proyectos</span>}
      </p>
    </div>
  );
}

/** Individual semester KPI: average of the months with a record, semester progress and a strip per month. */
function SemesterKpi({ records, period, onSelect }: { records: KpiRecord[]; period: string; onSelect: (period: string) => void }) {
  const semester = semesterOf(period);
  const months = monthsOf(semester);
  const byMonth = new Map(records.map((r) => [r.period, totalScore(r)]));
  const avgScore = average(months.map((m) => byMonth.get(m)));

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-mono uppercase tracking-widest text-accent">KPI semestral · {semesterLabel(semester)}</h4>
      <p className="text-[11px] text-ink/50">Pulsa un mes para ver su KPI mensual.</p>
      <SemesterProgress semester={semester} avgScore={avgScore} />
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Meses del semestre">
        {months.map((m) => {
          const score = byMonth.get(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelect(m)}
              aria-pressed={m === period}
              className={cn(
                'rounded-md border px-1 py-1 text-center text-[10px] leading-tight',
                m === period ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/60',
              )}
            >
              <span className="block capitalize text-ink/60">{new Date(`${m}-01T00:00:00Z`).toLocaleDateString('es', { month: 'short', timeZone: 'UTC' })}</span>
              <span className="block font-semibold tabular-nums">{score ?? '-'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditMember({
  member,
  members,
  onDone,
  onChanged,
  onError,
}: Shared & { member: Member; members: Member[]; onDone: () => void }) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [stationId, setStationId] = useState(member.stationId);
  /** '' = same department as the station. */
  const [departmentKey, setDepartmentKey] = useState<string>(member.departmentKey ?? '');
  const [busy, setBusy] = useState(false);

  const freeStations = useMemo(() => {
    const taken = new Set(members.filter((m) => m.id !== member.id).map((m) => m.stationId));
    return STATIONS.filter((s) => !taken.has(s.id));
  }, [members, member.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/members/${member.id}`, 'PATCH', { name, role, stationId, departmentKey: departmentKey || null });
      await onChanged();
      onDone();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-4">
      <Field label="Nombre">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </Field>
      <Field label="Cargo">
        <input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Departamento">
        <select className={inputClass} value={departmentKey} onChange={(e) => setDepartmentKey(e.target.value)}>
          <option value="">El del puesto ({DEPARTMENTS[findStation(stationId)?.department ?? 'ia_cfd'].short})</option>
          {DEPARTMENT_KEYS.map((key) => (
            <option key={key} value={key}>
              {DEPARTMENTS[key].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Estación">
        <select className={inputClass} value={stationId} onChange={(e) => setStationId(e.target.value)}>
          {freeStations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {DEPARTMENTS[s.department].short}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
          {busy ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink/60">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function KpiTiles({ record }: { record: KpiRecord }) {
  const rate = compliance(record);
  return (
    <div className="space-y-4">
      <KpiGroup title="Operaciones y volumen">
        <Tile label="Operaciones">{record.operationsCount}</Tile>
        <Tile label="Volumen">{money(record.volume)}</Tile>
      </KpiGroup>
      <KpiGroup title="P&L y rentabilidad">
        <Tile label="P&L">
          <SignedMoney value={record.pnl} />
        </Tile>
        <Tile label="Rentabilidad">
          <SignedPercent value={record.pnlPct} />
        </Tile>
      </KpiGroup>
      <KpiGroup title="Metas y cumplimiento">
        <Tile label="Meta">{money(record.goal)}</Tile>
        <Tile label="Alcanzado">{money(record.achieved)}</Tile>
        <Tile label="Cumplimiento">
          <span className={rate !== null && rate < 100 ? 'text-danger' : 'text-accent'}>{rate === null ? 'Sin meta' : `${rate}%`}</span>
        </Tile>
      </KpiGroup>
      <KpiGroup title="Errores e incidencias">
        <Tile label="Errores">
          <span className={record.errors > 0 ? 'text-danger' : undefined}>{record.errors}</span>
        </Tile>
        <Tile label="Incidencias">
          <span className={record.incidents > 0 ? 'text-danger' : undefined}>{record.incidents}</span>
        </Tile>
      </KpiGroup>
      {record.notes && <p className="whitespace-pre-wrap rounded-lg bg-border/30 px-3 py-2 text-xs">{record.notes}</p>}
    </div>
  );
}

function KpiGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-mono uppercase tracking-widest text-accent">{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

type NumericKey = Exclude<keyof KpiValues, 'notes'>;

const FORM_FIELDS: { key: NumericKey; label: string; step: string; min?: number; max?: number }[] = [
  { key: 'operationsCount', label: 'Operaciones', step: '1', min: 0 },
  { key: 'volume', label: 'Volumen', step: '0.01', min: 0 },
  { key: 'pnl', label: 'P&L', step: '0.01' },
  { key: 'pnlPct', label: 'Rentabilidad %', step: '0.01' },
  { key: 'goal', label: 'Meta', step: '0.01', min: 0 },
  { key: 'achieved', label: 'Alcanzado', step: '0.01' },
  { key: 'errors', label: 'Errores', step: '1', min: 0 },
  { key: 'incidents', label: 'Incidencias', step: '1', min: 0 },
  ...SCORE_SEGMENTS.map((segment) => ({ key: segment.key, label: `${segment.label} (0-100)`, step: '0.1', min: 0, max: 100 })),
];

function KpiForm({
  memberId,
  period,
  initial,
  onSaved,
  onError,
}: {
  memberId: string;
  period: string;
  initial: KpiValues;
  onSaved: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<keyof KpiValues, string>>(
    () => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) as Record<keyof KpiValues, string>,
  );
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/members/${memberId}/kpis`, 'PUT', { period, ...values });
      setOpen(false);
      await onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={primaryButton} onClick={() => setOpen(true)}>
        Registrar KPIs de {monthLabel(period)}
      </button>
    );
  }

  const set = (key: keyof KpiValues, value: string) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border p-4">
      <h4 className="text-[11px] font-mono uppercase tracking-widest text-accent">KPIs de {monthLabel(period)}</h4>
      <div className="grid grid-cols-2 gap-3">
        {FORM_FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              step={field.step}
              min={field.min}
              max={field.max}
              value={values[field.key]}
              onChange={(e) => set(field.key, e.target.value)}
              required
            />
          </Field>
        ))}
      </div>
      <Field label="Notas">
        <textarea className={inputClass} rows={3} maxLength={1000} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Guardando...' : 'Guardar KPIs'}
        </button>
        <button type="button" className={secondaryButton} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function History({ records, selected, onSelect }: { records: KpiRecord[]; selected: string; onSelect: (period: string) => void }) {
  if (records.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-mono uppercase tracking-widest text-accent">Historial</h4>
      <TableFrame>
        <thead>
          <tr className="border-b border-border">
            <Th>Periodo</Th>
            <Th right>Calificación</Th>
            <Th right>P&L</Th>
            <Th right>Cumplimiento</Th>
            <Th right>Errores + inc.</Th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const rate = compliance(r);
            return (
              <tr
                key={r.period}
                onClick={() => onSelect(r.period)}
                className={`cursor-pointer border-b border-border last:border-0 hover:bg-border/30 ${r.period === selected ? 'bg-border/40' : ''}`}
              >
                <Td className="capitalize">{monthLabel(r.period)}</Td>
                <Td right>{totalScore(r)}</Td>
                <Td right>
                  <SignedMoney value={r.pnl} />
                </Td>
                <Td right>{rate === null ? '-' : `${rate}%`}</Td>
                <Td right>{r.errors + r.incidents}</Td>
              </tr>
            );
          })}
        </tbody>
      </TableFrame>
    </div>
  );
}
