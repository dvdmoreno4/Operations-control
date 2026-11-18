import { ApiError, db, jsonBody, parseText, parseUuid, route } from '@/src/lib/api';
import { readPdfPages } from '@/src/lib/ib/pdfLayout';
import { IbParseError, parsePortfolioAnalyst } from '@/src/lib/ib/portfolioAnalyst';
import { listReports, saveReport } from '@/src/lib/ib/reportsDb';
import type { IbReportListItem } from '@/src/lib/ib/types';
import { DOCUMENTS_BUCKET } from '@/src/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Reading a 50-page PDF takes a few seconds.
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

export const GET = route<Context>(async (_req, { params }): Promise<{ reports: IbReportListItem[] }> => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  return { reports: await listReports(memberId) };
});

/** Reads an uploaded PortfolioAnalyst PDF, stores its data and scores it. */
export const POST = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const path = typeof body.path === 'string' ? body.path : '';
  if (!path.startsWith(`ib/${memberId}/`) || path.includes('..')) throw new ApiError(400, 'Ruta de archivo no válida');
  const fileName = parseText(body.name, 'El nombre del archivo', { required: true, max: 200 });

  const storage = db().storage.from(DOCUMENTS_BUCKET);
  const { data, error } = await storage.download(path);
  if (error || !data) {
    console.error(error?.message);
    throw new ApiError(404, 'No se encontró el PDF subido');
  }

  try {
    const pages = await readPdfPages(new Uint8Array(await data.arrayBuffer()));
    const report = parsePortfolioAnalyst(pages);
    return await saveReport(memberId, path, fileName, report);
  } catch (e) {
    // The PDF is only kept when its report was saved.
    await storage.remove([path]);
    if (e instanceof IbParseError) throw new ApiError(422, e.message);
    if (e instanceof ApiError) throw e;
    console.error(e);
    throw new ApiError(422, 'No se pudo leer el PDF. ¿Es el informe PortfolioAnalyst de Interactive Brokers?');
  }
});
