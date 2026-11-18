import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/apiClient';
import { DEPARTMENT_KEYS, DEPARTMENTS, findStation } from '../../lib/floorplan';
import type { Member } from '../../lib/kpis';
import { Field, inputClass, primaryButton, secondaryButton } from '../ui';
import { PLAN_VIEWBOX } from './FloorPlan';

type Props = {
  stationId: string;
  member: Member | undefined;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
};

/**
 * Popover anchored to a station of the floor plan, to edit the member's name and role
 * or assign a member to an empty station. Must be rendered inside a `relative` wrapper
 * that has exactly the size of the plan SVG.
 */
export function StationPopover({ stationId, member, onClose, onChanged, onError }: Props) {
  const station = findStation(stationId);
  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState(member?.role ?? '');
  const [department, setDepartment] = useState<string>(member?.departmentKey ?? station?.department ?? '');
  const [busy, setBusy] = useState(false);

  // Opened from the side panel the popover can be off screen; bring it into view.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  if (!station) return null;

  // Station position as a percentage of the plan, from the SVG viewBox.
  const left = ((station.x - PLAN_VIEWBOX.x) / PLAN_VIEWBOX.width) * 100;
  const top = ((station.y - PLAN_VIEWBOX.y) / PLAN_VIEWBOX.height) * 100;
  const openLeft = left > 55;
  const openUp = top > 55;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      // The station's own department is stored as null ("same as the station").
      const departmentKey = !station || department === station.department ? null : department;
      if (member) await api(`/api/members/${member.id}`, 'PATCH', { name, role, departmentKey });
      else await api('/api/members', 'POST', { stationId, name, role, departmentKey });
      await onChanged();
      onClose();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={member ? `Editar estación ${stationId}` : `Asignar estación ${stationId}`}
      className="absolute z-30 w-64 max-w-[80vw]"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        transform: `translate(${openLeft ? 'calc(-100% + 14px)' : '-14px'}, ${openUp ? 'calc(-100% - 18px)' : '18px'})`,
      }}
    >
      {/* Arrow pointing at the station. */}
      <span
        aria-hidden
        className={`absolute size-3 rotate-45 border-border bg-surface ${openUp ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-l border-t'}`}
        style={openLeft ? { right: 8 } : { left: 8 }}
      />
      <form onSubmit={submit} className="relative space-y-3 rounded-xl border border-border bg-surface p-4 text-ink shadow-2xl">
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Estación {stationId}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-ink/60">
              <span className="size-2 rounded-sm" style={{ backgroundColor: DEPARTMENTS[station.department].color }} />
              {DEPARTMENTS[station.department].short} · {member ? 'Editar miembro' : 'Estación inactiva'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-ink/50 hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <Field label="Nombre">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
        </Field>
        <Field label="Cargo">
          <input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Departamento">
          <select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
            {DEPARTMENT_KEYS.map((key) => (
              <option key={key} value={key}>
                {DEPARTMENTS[key].label}
                {key === station.department ? ' (del puesto)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
            {busy ? 'Guardando...' : member ? 'Guardar' : 'Asignar miembro'}
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
