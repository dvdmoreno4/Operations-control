import { Check, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ACTIVITY_INFO,
  ACTIVITY_KINDS,
  activityBonus,
  MAX_ACTIVITY_BONUS,
  MAX_ACTIVITY_PENALTY,
  type ActivityKind,
  type MemberActivity,
} from '../../lib/activities';
import { api } from '../../lib/apiClient';
import { cn } from '../../lib/cn';
import { inputClass, primaryButton, rowAction, secondaryButton } from '../ui';
import { monthLabel } from './MemberPanel';

type Props = {
  memberId: string;
  /** Month shown and used for new activities, YYYY-MM. */
  period: string;
  admin: boolean;
  /** Reloads the member's KPIs after the month's activities score changes. */
  onScoreChanged: () => Promise<void>;
  onError: (error: unknown) => void;
};

const points = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${String(Math.abs(n)).replace('.', ',')}`;

const STATES: { done: boolean | null; label: string; on: string }[] = [
  { done: null, label: 'Pendiente', on: 'bg-border text-ink' },
  { done: true, label: 'Realizada', on: 'bg-emerald-600 text-white' },
  { done: false, label: 'No realizada', on: 'bg-red-600 text-white' },
];

export function ActivitiesSection({ memberId, period, admin, onScoreChanged, onError }: Props) {
  const [items, setItems] = useState<MemberActivity[] | null>(null);
  const [adding, setAdding] = useState<ActivityKind | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ activities: MemberActivity[] }>(`/api/members/${memberId}/activities`)).activities);
    } catch (e) {
      onError(e);
    }
  }, [memberId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await Promise.all([load(), onScoreChanged()]);
    } catch (e) {
      onError(e);
    }
  }

  const month = useMemo(() => (items ?? []).filter((a) => a.period === period), [items, period]);
  const score = activityBonus(month, period);

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-mono uppercase tracking-widest text-accent">Actividades extraordinarias y colaboraciones</h4>

      <div className="rounded-lg border border-border px-3 py-2 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">
            Ajuste de <span className="capitalize">{monthLabel(period)}</span>
          </span>
          <span className={cn('text-sm font-semibold tabular-nums', score.net < 0 ? 'text-danger' : 'text-accent')}>
            {points(score.net)}
            <span className="text-xs font-normal text-ink/50"> pts al KPI central</span>
          </span>
        </div>
        <p className="mt-1 text-ink/60">
          Plus {points(score.bonus)} por {score.doneCount} actividades realizadas (máx. +{MAX_ACTIVITY_BONUS}). Las actividades son un adicional:
          no hacerlas no resta, salvo el conversatorio, que es obligatorio y resta{' '}
          {ACTIVITY_INFO.conversatorio.penalty} pts cada vez que se marca como no realizado (máx. −{MAX_ACTIVITY_PENALTY}).
          {score.penalty > 0 && <span className="font-semibold text-danger"> Este mes resta −{String(score.penalty).replace('.', ',')}.</span>}
        </p>
      </div>

      {items === null ? (
        <p className="text-sm text-ink/60">Cargando actividades...</p>
      ) : (
        <ul className="space-y-2">
          {ACTIVITY_KINDS.map((kind) => {
            const list = month.filter((a) => a.kind === kind);
            const done = list.filter((x) => x.done === true).length;
            const { bonus, penalty } = ACTIVITY_INFO[kind];
            return (
              <li key={kind} className="space-y-2 rounded-lg border border-border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {ACTIVITY_INFO[kind].label}{' '}
                    <span className="text-xs font-normal text-ink/50">
                      · {points(bonus)} realizada{penalty > 0 ? ` · ${points(-penalty)} no realizada` : ''} · {done} de {list.length} realizadas
                    </span>
                  </p>
                  {adding !== kind && (
                    <button type="button" className={secondaryButton} onClick={() => setAdding(kind)}>
                      Añadir
                    </button>
                  )}
                </div>

                {adding === kind && (
                  <NewActivity
                    memberId={memberId}
                    kind={kind}
                    period={period}
                    onDone={() => setAdding(null)}
                    onCreated={() => run(async () => undefined)}
                    onError={onError}
                  />
                )}

                {list.length === 0 && adding !== kind && <p className="text-ink/50">Sin actividades este mes.</p>}
                {list.map((a) => (
                  <ActivityRow key={a.id} activity={a} admin={admin} run={run} />
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {!admin && <p className="text-[11px] text-ink/50">Solo un administrador puede marcar una actividad como realizada o no realizada, o borrarla.</p>}
    </div>
  );
}

function ActivityRow({ activity, admin, run }: { activity: MemberActivity; admin: boolean; run: (action: () => Promise<unknown>) => Promise<void> }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md bg-border/20 px-2.5 py-2">
      <p className="min-w-0 flex-1 whitespace-pre-wrap">{activity.description}</p>
      <div className="flex shrink-0 items-center gap-1">
        {admin ? (
          <div className="flex overflow-hidden rounded-full border border-border" role="group" aria-label="Estado">
            {STATES.map((state) => (
              <button
                key={String(state.done)}
                type="button"
                aria-pressed={activity.done === state.done}
                disabled={activity.done === state.done}
                onClick={() => void run(() => api(`/api/activities/${activity.id}`, 'PATCH', { done: state.done }))}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-semibold disabled:cursor-default',
                  activity.done === state.done ? state.on : 'text-ink/60 hover:bg-border/40',
                )}
              >
                {state.label}
              </button>
            ))}
          </div>
        ) : (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              activity.done === true
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : activity.done === false
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-border text-ink/60',
            )}
          >
            {activity.done === true && <Check className="size-3" aria-hidden />}
            {STATES.find((s) => s.done === activity.done)?.label}
          </span>
        )}
        {admin && (
          <button
            type="button"
            className={rowAction}
            aria-label="Borrar actividad"
            onClick={() => {
              if (window.confirm('¿Borrar esta actividad?')) void run(() => api(`/api/activities/${activity.id}`, 'DELETE'));
            }}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function NewActivity({
  memberId,
  kind,
  period,
  onDone,
  onCreated,
  onError,
}: {
  memberId: string;
  kind: ActivityKind;
  period: string;
  onDone: () => void;
  onCreated: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/members/${memberId}/activities`, 'POST', { kind, period, description });
      await onCreated();
      onDone();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        className={inputClass}
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={2000}
        placeholder={`Descripción de la actividad (${ACTIVITY_INFO[kind].label.toLowerCase()})`}
        aria-label="Descripción"
        required
        autoFocus
      />
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy || !description.trim()}>
          {busy ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
