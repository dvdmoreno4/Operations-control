import { MapPin } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiClientError, errorMessage } from '../../lib/apiClient';
import { STATIONS, type DepartmentKey } from '../../lib/floorplan';
import type { Member } from '../../lib/kpis';
import { semesterOf, semestersOf } from '../../lib/semester';
import { aggregateByMember, stationStats, type PeriodKpis } from '../../lib/stats';
import { Alert, secondaryButton } from '../ui';
import { FloorPlan, Legend } from './FloorPlan';
import { MemberPanel } from './MemberPanel';
import { StationPopover } from './StationPopover';
import { StatsPanels, type StatsMode } from './StatsPanels';

export function PlanTab({ onLogout, admin }: { onLogout: () => Promise<void>; admin: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [kpis, setKpis] = useState<PeriodKpis | null>(null);
  /** Month picked in the stats panel. Null means the most recent month with data. */
  const [period, setPeriod] = useState<string | null>(null);
  /** Global KPIs by month or by semester. */
  const [mode, setMode] = useState<StatsMode>('semestral');
  const [semester, setSemester] = useState(() => semesterOf(new Date().toISOString().slice(0, 7)));
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  /** Station whose edit popover is open on the plan. */
  const [popoverStationId, setPopoverStationId] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<DepartmentKey | null>(null);
  const [error, setError] = useState('');

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiClientError && e.status === 401) void onLogout();
      else setError(errorMessage(e));
    },
    [onLogout],
  );

  const loadMembers = useCallback(async () => {
    try {
      setMembers((await api<{ members: Member[] }>('/api/members')).members);
      setError('');
    } catch (e) {
      handleError(e);
    }
  }, [handleError]);

  const loadKpis = useCallback(async () => {
    try {
      const url = mode === 'semestral' ? `/api/kpis?semester=${semester}` : period ? `/api/kpis?period=${period}` : '/api/kpis';
      setKpis(await api<PeriodKpis>(url));
    } catch (e) {
      handleError(e);
    }
  }, [mode, semester, period, handleError]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  const reload = useCallback(async () => {
    await Promise.all([loadMembers(), loadKpis()]);
  }, [loadMembers, loadKpis]);

  /** Selects a station and opens its edit popover on the plan. */
  const openStation = useCallback((stationId: string) => {
    setSelectedStationId(stationId);
    setPopoverStationId(stationId);
  }, []);
  const closePopover = useCallback(() => setPopoverStationId(null), []);

  const membersByStation = useMemo(() => new Map((members ?? []).map((m) => [m.stationId, m])), [members]);
  const stats = useMemo(() => {
    const records = kpis?.records ?? [];
    return stationStats(members ?? [], mode === 'semestral' ? aggregateByMember(records) : records);
  }, [members, kpis, mode]);
  const semesters = useMemo(() => {
    const list = semestersOf(kpis?.periods ?? []);
    const current = semesterOf(new Date().toISOString().slice(0, 7));
    return list.includes(current) ? list : [current, ...list];
  }, [kpis]);
  const occupied = members?.length ?? 0;

  return (
    <div className="space-y-4">
      {error && (
        <Alert>
          {error}{' '}
          <button type="button" className="underline" onClick={() => setError('')}>
            Cerrar
          </button>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-5 space-y-4 text-slate-100">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 text-sky-400" aria-hidden />
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide">Plano interactivo de planta (HQ)</h2>
                  <p className="text-[11px] text-slate-400">
                    {members !== null
                      ? `${occupied} de ${STATIONS.length} estaciones ocupadas`
                      : error
                        ? 'Sin datos'
                        : 'Cargando...'}
                  </p>
                </div>
              </div>
              <p className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-300">
                Haz clic en una <span className="text-sky-400">estación de computadora</span> para consultar su expediente
              </p>
            </header>

            <div className="relative">
              <FloorPlan
                membersByStation={membersByStation}
                selectedStationId={selectedStationId}
                highlighted={highlighted}
                onSelect={openStation}
              />
              {popoverStationId && (
                <StationPopover
                  key={popoverStationId}
                  stationId={popoverStationId}
                  member={membersByStation.get(popoverStationId)}
                  onClose={closePopover}
                  onChanged={reload}
                  onError={handleError}
                />
              )}
            </div>

            <Legend highlighted={highlighted} onToggle={(key) => setHighlighted((current) => (current === key ? null : key))} />
          </section>

          <MemberPanel
            stationId={selectedStationId}
            member={selectedStationId ? membersByStation.get(selectedStationId) : undefined}
            members={members ?? []}
            admin={admin}
            onChanged={reload}
            onError={handleError}
          />

          <div className="flex justify-end">
            <button type="button" className={secondaryButton} onClick={() => void onLogout()}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <aside className="xl:col-span-5" aria-label="Estadísticas">
          <StatsPanels
            stats={stats}
            department={highlighted}
            onDepartment={setHighlighted}
            mode={mode}
            onMode={setMode}
            period={mode === 'mensual' ? (kpis?.period ?? null) : null}
            periods={kpis?.periods ?? []}
            onPeriod={setPeriod}
            semester={semester}
            semesters={semesters}
            onSemester={setSemester}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStationId}
            loading={members === null || kpis === null}
            onEditStation={openStation}
          />
        </aside>
      </div>
    </div>
  );
}
