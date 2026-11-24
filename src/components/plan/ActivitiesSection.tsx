import { Check, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ACTIVITY_INFO, ACTIVITY_KINDS, activityScore, type ActivityKind, type MemberActivity } from '../../lib/activities';
import { api } from '../../lib/apiClient';
import { cn } from '../../lib/cn';
import { SCORE_SEGMENTS } from '../../lib/kpis';
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

const EXTRA_WEIGHT = Math.round((SCORE_SEGMENTS.find((s) => s.key === 'scoreExtra')?.weight ?? 0) * 100);

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
  const score = activityScore(month, period);

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-mono uppercase tracking-widest text-accent">Actividades extraordinarias y colaboraciones</h4>

      <div className="rounded-lg border border-border px-3 py-2 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">
            Puntuación de <span className="capitalize">{monthLabel(period)}</span>
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {score.score}
            <span className="text-xs font-normal text-ink/50"> / 100</span>
          </span>
        </div>
        <p className="mt-1 text-ink/60">
          Cada tipo realizado al menos una vez en el mes suma su porcentaje. Pesa un {EXTRA_WEIGHT}% en la calificación total del KPI.
        </p>
      </div>

      {items === null ? (
        <p className="text-sm text-ink/60">Cargando actividades...</p>
      ) : (
        <ul className="space-y-2">
          {ACTIVITY_KINDS.map((kind) => {
            const list = month.filter((a) => a.kind === kind);
            const earned = score.doneKinds.includes(kind);
            return (
              <li key={kind} className="space-y-2 rounded-lg border border-border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {ACTIVITY_INFO[kind].label}{' '}
                    <span className={cn('text-xs font-normal', earned ? 'text-accent' : 'text-ink/50')}>
                      · {ACTIVITY_INFO[kind].pct}%{earned ? ' sumado' : ''}
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
      {!admin && <p className="text-[11px] text-ink/50">Solo un administrador puede marcar una actividad como realizada o borrarla.</p>}
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
            {[true, false].map((done) => (
              <button
                key={String(done)}
                type="button"
                aria-pressed={activity.done === done}
                disabled={activity.done === done}
                onClick={() => void run(() => api(`/api/activities/${activity.id}`, 'PATCH', { done }))}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-semibold disabled:cursor-default',
                  activity.done === done ? (done ? 'bg-emerald-600 text-white' : 'bg-ink/70 text-white') : 'text-ink/60 hover:bg-border/40',
                )}
              >
                {done ? 'Realizada' : 'No realizada'}
              </button>
            ))}
          </div>
        ) : (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              activity.done ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-border text-ink/60',
            )}
          >
            {activity.done && <Check className="size-3" aria-hidden />}
            {activity.done ? 'Realizada' : 'No realizada'}
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
