import { ApiError, db, jsonBody, parseText, parseUuid, route } from '@/src/lib/api';
import { Mt5ParseError, parseMt5Report } from '@/src/lib/mt5/report';
import { listMt5Reports, saveMt5Report } from '@/src/lib/mt5/reportsDb';
import type { Mt5ReportListItem } from '@/src/lib/mt5/types';
import { readXlsx, XlsxError } from '@/src/lib/mt5/xlsx';
import { DOCUMENTS_BUCKET } from '@/src/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

export const GET = route<Context>(async (_req, { params }): Promise<{ reports: Mt5ReportListItem[] }> => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  return { reports: await listMt5Reports(memberId) };
});

/** Reads an uploaded MetaTrader 5 Excel report, stores its data and scores it. */
export const POST = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const path = typeof body.path === 'string' ? body.path : '';
  if (!path.startsWith(`mt5/${memberId}/`) || path.includes('..')) throw new ApiError(400, 'Ruta de archivo no válida');
  const fileName = parseText(body.name, 'El nombre del archivo', { required: true, max: 200 });

  const storage = db().storage.from(DOCUMENTS_BUCKET);
  const { data, error } = await storage.download(path);
  if (error || !data) {
    console.error(error?.message);
    throw new ApiError(404, 'No se encontró el Excel subido');
  }

  try {
    const report = parseMt5Report(readXlsx(new Uint8Array(await data.arrayBuffer())));
    return await saveMt5Report(memberId, path, fileName, report);
  } catch (e) {
    await storage.remove([path]);
    if (e instanceof Mt5ParseError || e instanceof XlsxError) throw new ApiError(422, e.message);
    if (e instanceof ApiError) throw e;
    console.error(e);
    const missingTable = e instanceof Error && /mt5_reports/.test(e.message);
    throw new ApiError(
      422,
      missingTable ? 'Falta ejecutar la migración 010 en Supabase' : 'No se pudo leer el Excel. ¿Es el informe de MetaTrader 5 (Trade History Report)?',
    );
  }
});
