// Reads a PDF into visual rows of positioned text cells. Server-only (uses unpdf / pdf.js).
//
// IB PortfolioAnalyst PDFs are landscape pages whose text is drawn rotated 90 degrees, and most
// strings are drawn twice. This turns any page into rows top to bottom, each with its cells left to
// right, in page units, with the duplicates removed.

import { getDocumentProxy } from 'unpdf';
import type { PdfPage } from './layout';

type TextItem = { str: string; transform: number[] };

export async function readPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  const pdf = await getDocumentProxy(data);
  const pages: PdfPage[] = [];

  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const cells: { s: string; row: number; col: number }[] = [];
    for (const raw of content.items as unknown[]) {
      const item = raw as Partial<TextItem>;
      if (typeof item.str !== 'string' || !item.transform) continue;
      const s = item.str.trim();
      if (!s) continue;
      const [a, b, , , e, f] = item.transform;
      const angle = Math.round((Math.atan2(b, a) * 180) / Math.PI);
      // Visual position: row grows downwards, col grows to the right.
      const position =
        angle === 90 ? { row: e, col: f } : angle === -90 || angle === 270 ? { row: width - e, col: height - f } : { row: height - f, col: e };
      const duplicate = cells.some((c) => c.s === s && Math.abs(c.row - position.row) < 1.5 && Math.abs(c.col - position.col) < 3);
      if (!duplicate) cells.push({ s, ...position });
    }

    const rows: PdfPage['rows'] = [];
    for (const cell of cells.sort((x, y) => x.row - y.row)) {
      const row = rows.find((r) => Math.abs(r.at - cell.row) <= 2.5);
      if (row) row.cells.push({ s: cell.s, col: cell.col });
      else rows.push({ at: cell.row, cells: [{ s: cell.s, col: cell.col }] });
    }
    for (const row of rows) row.cells.sort((x, y) => x.col - y.col);
    pages.push({ number, rows });
  }
  return pages;
}
