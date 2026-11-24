import { useState, type FormEvent } from 'react';
import { api } from '../../lib/apiClient';
import { screenScore, SCREEN_HOURS_GOAL } from '../../lib/goals';
import type { KpiRecord } from '../../lib/kpis';
import { monthsOf, semesterLabel, semesterOf } from '../../lib/semester';
import { inputClass, primaryButton } from '../ui';
import { monthLabel } from './MemberPanel';

type Props = {
  memberId: string;
  /** Month shown, YYYY-MM. */
  period: string;
  records: KpiRecord[];
  onSaved: () => Promise<void>;
  onError: (error: unknown) => void;
};

function Bar({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">{label}</span>
        <span className="font-semibold tabular-nums">
          {value} / {goal} {unit} <span className="font-normal text-ink/50">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/60" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="h-full rounded-full bg-[#eab308] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ScreenTimeSection({ memberId, period, records, onSaved, onError }: Props) {
  const record = records.find((r) => r.period === period);
  const saved = record?.screenHours ?? null;
  const [hours, setHours] = useState(saved === null ? '' : String(saved));
  const [busy, setBusy] = useState(false);

  const semester = semesterOf(period);
  const semesterHours = monthsOf(semester).reduce((sum, m) => sum + (records.find((r) => r.period === m)?.screenHours ?? 0), 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/members/${memberId}/screen-time`, 'PUT', { period, hours });
      await onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const preview = hours === '' || Number.isNaN(Number(hours)) ? null : screenScore(Number(hours));

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/60">
        Meta: {SCREEN_HOURS_GOAL} horas al mes. La calificación es horas / {SCREEN_HOURS_GOAL} (máximo 100) y pesa 1/3 del KPI central.
      </p>

      <Bar label={`Horas de ${monthLabel(period)}`} value={saved ?? 0} goal={SCREEN_HOURS_GOAL} unit="h" />
      <Bar label={`Semestre ${semesterLabel(semester)}`} value={Math.round(semesterHours * 10) / 10} goal={SCREEN_HOURS_GOAL * 6} unit="h" />

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Horas en pantalla del mes</span>
          <input
            className={`${inputClass} w-36`}
            type="number"
            inputMode="decimal"
            min={0}
            max={744}
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
          />
        </label>
        <button type="submit" className={primaryButton} disabled={busy || hours === ''}>
          {busy ? 'Guardando...' : 'Guardar horas'}
        </button>
        {preview !== null && <span className="text-xs text-ink/60">Calificación: {preview} / 100</span>}
      </form>
      <p className="text-[11px] text-ink/50">
        Registro manual por ahora. La importación automática desde ActivityWatch se añadirá con un export de ejemplo.
      </p>
    </div>
  );
}
