import Image from 'next/image';
import { Printer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import logo from '@/Logo.png';
import { activityBonus, type MemberActivity } from '../../lib/activities';
import { api, errorMessage } from '../../lib/apiClient';
import { DEPARTMENTS, type DepartmentKey } from '../../lib/floorplan';
import type { IbReportListItem } from '../../lib/ib/types';
import { memberDepartment, type Member } from '../../lib/kpis';
import type { Mt5ReportListItem } from '../../lib/mt5/types';
import { memberProjectScores, progressOf, STATUS_INFO, type Project } from '../../lib/projects';
import { buildReport, type ReportData } from '../../lib/reportData';
import { OPEN_STATUSES, type MemberRequest } from '../../lib/requests';
import { semesterOf } from '../../lib/semester';
import type { PeriodKpis } from '../../lib/stats';
import { LoginGate } from '../LoginGate';
import { money, primaryButton, SignedMoney, TableFrame, Td, Th } from '../ui';

type Query = { period: string; department: DepartmentKey | null; memberId: string | null };

type MemberExtras = {
  projects: Project[];
  activities: MemberActivity[];
  requests: MemberRequest[];
  ib: IbReportListItem[];
  mt5: Mt5ReportListItem[];
};

function readQuery(): Query {
  const params = new URLSearchParams(window.location.search);
  const department = params.get('department');
  return {
    period: params.get('period') ?? new Date().toISOString().slice(0, 7),
    department: department && department in DEPARTMENTS ? (department as DepartmentKey) : null,
    memberId: params.get('member'),
  };
}

const fmt = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? '-' : (Math.round(v * 10 ** digits) / 10 ** digits).toString());

export default function ReportPage() {
  return (
    <main className="mx-auto max-w-5xl bg-white p-4 sm:p-8 print:p-0">
      <LoginGate>{() => <Report />}</LoginGate>
    </main>
  );
}

function Report() {
  const [query] = useState(readQuery);
  const [data, setData] = useState<ReportData | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [extras, setExtras] = useState<MemberExtras | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const semester = /-H[12]$/.test(query.period) ? query.period : semesterOf(query.period);
        const [{ members }, kpis] = await Promise.all([
          api<{ members: Member[] }>('/api/members'),
          api<PeriodKpis>(`/api/kpis?semester=${semester}`),
        ]);
        const target = query.memberId ? (members.find((m) => m.id === query.memberId) ?? null) : null;
        if (query.memberId && !target) throw new Error('El trabajador ya no existe');
        const inScope = (m: Member) =>
          target ? m.id === target.id : query.department ? memberDepartment(m) === query.department : true;
        setMember(target);
        setData(buildReport(members, kpis.records, query.period, inScope));

        if (target) {
          const [projects, activities, requests, ib, mt5] = await Promise.all([
            api<{ projects: Project[] }>(`/api/members/${target.id}/projects`),
            api<{ activities: MemberActivity[] }>(`/api/members/${target.id}/activities`),
            api<{ requests: MemberRequest[] }>(`/api/members/${target.id}/requests`),
            api<{ reports: IbReportListItem[] }>(`/api/members/${target.id}/ib-reports`),
            api<{ reports: Mt5ReportListItem[] }>(`/api/members/${target.id}/mt5-reports`),
          ]);
          setExtras({ projects: projects.projects, activities: activities.activities, requests: requests.requests, ib: ib.reports, mt5: mt5.reports });
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [query]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-ink/60">Generando informe...</p>;

  const scopeTitle = member ? member.name : query.department ? DEPARTMENTS[query.department].label : 'Todos los departamentos';
  const generated = new Date().toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <article className="space-y-6 text-ink">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-ink/60">Vista previa del informe. Usa el botón para imprimirlo o guardarlo como PDF.</p>
        <button type="button" className={`${primaryButton} flex items-center gap-1.5`} onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          Imprimir / Guardar como PDF
        </button>
      </div>

      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest text-accent">Informe de KPIs · {data.periodLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{scopeTitle}</h1>
          {member && (
            <p className="text-sm text-ink/60">
              {member.role || 'Sin cargo'} · {memberDepartment(member) ? DEPARTMENTS[memberDepartment(member)!].label : ''} · Estación {member.stationId}
            </p>
          )}
          <p className="text-xs text-ink/50">Generado el {generated}</p>
        </div>
        <Image src={logo} alt="Emporium Quality Funds" className="h-12 w-auto" priority />
      </header>

      <Summary data={data} single={Boolean(member)} />

      <Section title={`Evolución del KPI · ${data.semester.replace('-H1', ' (ene - jun)').replace('-H2', ' (jul - dic)')}`}>
        <TrendBars trend={data.trend} highlight={data.mode === 'mensual' ? data.period : null} />
      </Section>

      <Section title="Componentes del KPI central (promedio)">
        <BarRows
          rows={data.summary.avgSegments.map((s) => ({ label: s.label, value: s.value, color: s.color }))}
          footer={`Plus de actividades: ${signed(data.summary.avgExtra)} · Plus por colaboración: ${signed(data.summary.avgCollab)}`}
        />
      </Section>

      {!member && !query.department && data.byDepartment.length > 0 && (
        <Section title="Comparación por departamento">
          <BarRows rows={data.byDepartment.map((d) => ({ label: `${d.label} (${d.members})`, value: d.avg, color: d.color }))} />
        </Section>
      )}

      {!member && (
        <Section title={`Ranking de trabajadores (${data.people.length})`}>
          <BarRows rows={data.people.map((p) => ({ label: p.member.name, value: p.total, color: p.department ? DEPARTMENTS[p.department].color : '#283d8c' }))} />
          <PeopleTable data={data} />
        </Section>
      )}

      {member && extras && <MemberDetails data={data} member={member} extras={extras} />}

      <footer className="border-t border-border pt-3 text-[10px] text-ink/50">
        KPI central = promedio de resultados operativos, proyectos y tiempo en pantalla (1/3 cada uno), más el plus de actividades extraordinarias y
        de colaboración en proyectos (0 a 100). Metas: rentabilidad mínima 25% anual, 140 h de pantalla al mes, 1 proyecto culminado por semestre.
      </footer>
    </article>
  );
}

const signed = (v: number | null) => (v === null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <h2 className="text-[11px] font-mono uppercase tracking-widest text-accent">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink/60">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{children}</div>
      {hint && <div className="text-[10px] text-ink/50">{hint}</div>}
    </div>
  );
}

function Summary({ data, single }: { data: ReportData; single: boolean }) {
  const s = data.summary;
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 break-inside-avoid">
      <Tile label={single ? 'Calificación total' : 'Calificación promedio'} hint={`KPI central ${fmt(s.avgCentral)}`}>
        {fmt(s.avgTotal)} <span className="text-xs font-normal text-ink/50">/ 100</span>
      </Tile>
      {!single && (
        <Tile label="Trabajadores con KPI" hint={`de ${s.members} asignados`}>
          {s.reporting}
        </Tile>
      )}
      <Tile label="P&L del periodo">
        <SignedMoney value={s.pnl} />
      </Tile>
      <Tile label="Cumplimiento de meta">{s.compliance === null ? 'Sin meta' : `${s.compliance}%`}</Tile>
      <Tile label="Operaciones" hint={`Volumen ${money(s.volume)}`}>
        {s.operations}
      </Tile>
      <Tile label="Errores / incidencias">
        {s.errors} / {s.incidents}
      </Tile>
      {s.avgSegments.map((seg) => (
        <Tile key={seg.key} label={seg.label}>
          {fmt(seg.value)}
        </Tile>
      ))}
    </section>
  );
}

/** Months of the semester as bars of the average total score (0-100), with the value on top. */
function TrendBars({ trend, highlight }: { trend: ReportData['trend']; highlight: string | null }) {
  const W = 600;
  const H = 180;
  const pad = { top: 18, bottom: 26, left: 8, right: 8 };
  const slot = (W - pad.left - pad.right) / trend.length;
  const barW = Math.min(46, slot * 0.6);
  const y = (v: number) => pad.top + (1 - v / 100) * (H - pad.top - pad.bottom);
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Calificación promedio por mes del semestre">
        {[0, 50, 100].map((t) => (
          <line key={t} x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
        ))}
        {trend.map((m, i) => {
          const cx = pad.left + slot * (i + 0.5);
          const month = new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('es', { month: 'short', timeZone: 'UTC' });
          return (
            <g key={m.month}>
              {m.avg !== null && (
                <>
                  <rect x={cx - barW / 2} y={y(m.avg)} width={barW} height={Math.max(1, y(0) - y(m.avg))} rx={4} fill={highlight === m.month ? '#283d8c' : '#2a78d6'} />
                  <text x={cx} y={y(m.avg) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0f1740">
                    {m.avg}
                  </text>
                </>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b7280">
                {month}
                {m.avg === null ? ' · sin datos' : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-ink/50">Promedio de la calificación total de los trabajadores con KPI registrado en cada mes.</p>
    </div>
  );
}

/** Horizontal 0-100 bars with label and value; color carries identity (department / segment). */
function BarRows({ rows, footer }: { rows: { label: string; value: number | null; color: string }[]; footer?: string }) {
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.label} className="grid grid-cols-[12rem_1fr_3rem] items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 truncate text-ink/80">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
              {row.label}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-border/50" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${row.value ?? 0}%`, backgroundColor: row.color }} />
            </div>
            <span className="text-right font-semibold tabular-nums">{fmt(row.value)}</span>
          </li>
        ))}
      </ul>
      {footer && <p className="text-[11px] text-ink/60">{footer}</p>}
    </div>
  );
}

function PeopleTable({ data }: { data: ReportData }) {
  return (
    <TableFrame>
      <thead>
        <tr className="border-b border-border">
          <Th>Trabajador</Th>
          <Th>Departamento</Th>
          <Th right>Operativa</Th>
          <Th right>Proyectos</Th>
          <Th right>Pantalla</Th>
          <Th right>Plus</Th>
          <Th right>Total</Th>
          <Th right>P&L</Th>
        </tr>
      </thead>
      <tbody>
        {data.people.map((p) => (
          <tr key={p.member.id} className="border-b border-border last:border-0">
            <Td>
              {p.member.name}
              {p.member.role && <span className="block text-[10px] text-ink/50">{p.member.role}</span>}
            </Td>
            <Td className="text-ink/70">{p.department ? DEPARTMENTS[p.department].short : '-'}</Td>
            <Td right>{fmt(p.record?.scoreOperational)}</Td>
            <Td right>{fmt(p.record?.scoreProjects)}</Td>
            <Td right>{fmt(p.record?.scoreScreenTime)}</Td>
            <Td right>{p.record ? signed((p.record.scoreExtra ?? 0) + (p.record.scoreCollab ?? 0)) : '-'}</Td>
            <Td right>
              <span className="font-semibold">{fmt(p.total)}</span>
            </Td>
            <Td right>{p.record ? <SignedMoney value={p.record.pnl} /> : '-'}</Td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function MemberDetails({ data, member, extras }: { data: ReportData; member: Member; extras: MemberExtras }) {
  const month = data.mode === 'mensual' ? data.period : (data.trend.filter((t) => t.avg !== null).at(-1)?.month ?? data.trend.at(-1)!.month);
  const projectScores = memberProjectScores(extras.projects, member.id, month);
  const activities = extras.activities.filter((a) => (data.mode === 'mensual' ? a.period === data.period : a.period.startsWith(data.semester.slice(0, 4))));
  const bonus = activityBonus(extras.activities, month);
  const openRequests = extras.requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const latestIb = extras.ib[0];
  const latestMt5 = extras.mt5[0];

  return (
    <>
      <Section title="Resultados operativos">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Tile label="Interactive Brokers · último informe" hint={latestIb ? `${latestIb.period} · ${latestIb.fileName}` : undefined}>
            {latestIb ? `${fmt(latestIb.score)} / 100` : 'Sin informes'}
          </Tile>
          <Tile label="MetaTrader 5 · último informe" hint={latestMt5 ? `${latestMt5.period} · retorno ${fmt(latestMt5.returnPct, 2)}%` : undefined}>
            {latestMt5 ? `${fmt(latestMt5.score)} / 100` : 'Sin informes'}
          </Tile>
        </div>
      </Section>

      <Section title={`Proyectos · avance meta semestral ${projectScores.owned.score} / 100`}>
        {extras.projects.length === 0 ? (
          <p className="text-xs text-ink/60">Sin proyectos.</p>
        ) : (
          <BarRows
            rows={extras.projects.map((p) => ({
              label: `${p.name}${p.memberId === member.id ? '' : ' (colabora)'}`,
              value: progressOf(p.status, p.manualProgress),
              color: STATUS_INFO[p.status].color,
            }))}
            footer={`Culminados: ${projectScores.owned.completedInSemester} en el semestre, ${projectScores.owned.completedInYear} en el año · plus por colaboración +${projectScores.collabBonus}`}
          />
        )}
      </Section>

      <Section title={`Actividades extraordinarias · ajuste ${signed(bonus.net)} en ${month}`}>
        {activities.length === 0 ? (
          <p className="text-xs text-ink/60">Sin actividades registradas.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {activities.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 border-b border-border py-1 last:border-0">
                <span>
                  <span className="text-ink/50">{a.period} · </span>
                  {a.description}
                </span>
                <span className="shrink-0 font-semibold">{a.done === true ? 'Realizada' : a.done === false ? 'No realizada' : 'Pendiente'}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Solicitudes y recomendaciones abiertas (${openRequests.length})`}>
        {openRequests.length === 0 ? (
          <p className="text-xs text-ink/60">Sin solicitudes ni recomendaciones abiertas.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {openRequests.map((r) => (
              <li key={r.id} className="border-b border-border py-1 last:border-0">
                <span className="font-semibold">{r.title}</span> <span className="text-ink/50">· {r.kind === 'solicitud' ? 'Solicitud' : 'Recomendación'}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
