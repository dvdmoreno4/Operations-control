import { ApiError, db, jsonBody, parseNumber, parsePeriod, parseText, parseUuid, route, unwrap } from '@/src/lib/api';
import { recordFromRow, rowFromValues, type KpiRecord, type KpiValues } from '@/src/lib/kpis';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

export const GET = route<Context>(async (_req, { params }): Promise<{ records: KpiRecord[] }> => {
  const id = parseUuid((await params).id, NOT_FOUND);
  const rows = unwrap(await db().from('kpi_records').select('*').eq('member_id', id).order('period', { ascending: false }));
  return { records: rows.map(recordFromRow) };
});

/** Creates or replaces the KPI record of one month. */
export const PUT = route<Context>(async (req, { params }) => {
  const id = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const count = { min: 0, integer: true };
  const score = { min: 0, max: 100 };
  const values: KpiValues = {
    operationsCount: parseNumber(body.operationsCount, 'Operaciones', count),
    volume: parseNumber(body.volume, 'Volumen', { min: 0 }),
    pnl: parseNumber(body.pnl, 'P&L'),
    pnlPct: parseNumber(body.pnlPct, 'P&L %', { min: -1000, max: 1000 }),
    goal: parseNumber(body.goal, 'Meta', { min: 0 }),
    achieved: parseNumber(body.achieved, 'Alcanzado'),
    errors: parseNumber(body.errors, 'Errores', count),
    incidents: parseNumber(body.incidents, 'Incidencias', count),
    scoreOperational: parseNumber(body.scoreOperational, 'Resultados operativos', score),
    scoreProjects: parseNumber(body.scoreProjects, 'Proyectos', score),
    scoreScreenTime: parseNumber(body.scoreScreenTime, 'Tiempo en pantalla', score),
    notes: parseText(body.notes, 'Las notas', { max: 1000 }),
  };

  const client = db();
  const member = unwrap(await client.from('members').select('id').eq('id', id));
  if (member.length === 0) throw new ApiError(404, NOT_FOUND);

  unwrap(
    await client
      .from('kpi_records')
      .upsert({ member_id: id, period: parsePeriod(body.period), ...rowFromValues(values), updated_at: new Date().toISOString() })
      .select('member_id'),
  );
  return { ok: true };
});
