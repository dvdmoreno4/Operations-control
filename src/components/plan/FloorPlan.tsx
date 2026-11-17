import type { KeyboardEvent } from 'react';
import { DEPARTMENTS, STATIONS, ZONES, type DepartmentKey } from '../../lib/floorplan';
import type { Member } from '../../lib/kpis';

const EMPTY_COLOR = '#ef4444';

type Props = {
  membersByStation: Map<string, Member>;
  selectedStationId: string | null;
  highlighted: DepartmentKey | null;
  onSelect: (stationId: string) => void;
};

export function FloorPlan({ membersByStation, selectedStationId, highlighted, onSelect }: Props) {
  const zoneOpacity = (department: DepartmentKey) => (highlighted === null ? 0.45 : highlighted === department ? 0.85 : 0.15);

  function onKey(event: KeyboardEvent, stationId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(stationId);
  }

  return (
    <svg viewBox="-8 -8 356 286" className="w-full h-auto select-none" role="group" aria-label="Plano de planta">
      <rect x={-6} y={-6} width={352} height={282} rx={4} fill="#0b1120" stroke="#334155" strokeWidth={1} />
      <line x1={318} y1={30} x2={346} y2={-2} stroke="#475569" strokeWidth={0.8} />

      {ZONES.map((zone) => {
        const color = DEPARTMENTS[zone.department].color;
        return (
          <g key={zone.id}>
            <polygon
              points={zone.points}
              fill={color}
              fillOpacity={zoneOpacity(zone.department)}
              stroke={color}
              strokeWidth={1}
              className="transition-[fill-opacity] duration-200"
            />
            <text
              x={zone.labelX}
              y={zone.labelY}
              textAnchor={zone.labelAnchor ?? 'middle'}
              fontSize={zone.labelOutside ? 4.6 : 5.4}
              fontWeight={700}
              fill={zone.labelOutside ? color : '#f8fafc'}
              className="pointer-events-none"
            >
              {zone.label}
            </text>
          </g>
        );
      })}

      {STATIONS.map((station) => {
        const member = membersByStation.get(station.id);
        const selected = station.id === selectedStationId;
        const dimmed = highlighted !== null && highlighted !== station.department;
        const label = member ? `${station.id}: ${member.name}` : `${station.id}: estación vacía`;
        return (
          <g
            key={station.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onSelect(station.id)}
            onKeyDown={(event) => onKey(event, station.id)}
            className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-[#facc15]"
            opacity={dimmed ? 0.35 : 1}
          >
            <title>{label}</title>
            {selected && <circle cx={station.x} cy={station.y} r={10.5} fill="none" stroke="#facc15" strokeWidth={1.6} />}
            <circle
              cx={station.x}
              cy={station.y}
              r={7}
              fill={member ? '#0b1120' : EMPTY_COLOR}
              stroke={member ? '#e2e8f0' : '#fecaca'}
              strokeWidth={1.4}
              className="transition-transform hover:scale-110 origin-center [transform-box:fill-box]"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({
  highlighted,
  onToggle,
}: {
  highlighted: DepartmentKey | null;
  onToggle: (department: DepartmentKey) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Leyenda del plano de planta</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        {(Object.keys(DEPARTMENTS) as DepartmentKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={highlighted === key}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] leading-tight transition-colors ${
              highlighted === key ? 'border-slate-300 bg-slate-700/60 text-white' : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: DEPARTMENTS[key].color }} />
            {DEPARTMENTS[key].label}
          </button>
        ))}
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[11px] leading-tight text-slate-300">
          <span className="size-3 shrink-0 rounded-full border-[1.5px] border-slate-200 bg-[#0b1120]" />
          Computadoras y miembros
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[11px] leading-tight text-slate-300">
          <span className="size-3 shrink-0 rounded-full border-[1.5px] border-red-200" style={{ backgroundColor: EMPTY_COLOR }} />
          Estación vacía
        </div>
      </div>
    </div>
  );
}
