// Minimal .xlsx reader, server-only (node:zlib): returns the cell text of every sheet, row by row.
// An .xlsx is a ZIP of XML files; this reads the ZIP central directory, inflates the sheets and the
// shared strings, and pulls cell values out of the XML. Enough for exported reports (MetaTrader 5).

import { inflateRawSync } from 'node:zlib';

export type SheetRow = { row: number; cells: Record<string, string> };

export class XlsxError extends Error {}

function readZip(data: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // End of central directory: signature 0x06054b50, within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError('El archivo no es un Excel .xlsx válido');

  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  for (let n = 0; n < entries; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new XlsxError('Excel dañado (directorio ZIP)');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (!/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml)$/.test(name)) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = data.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(raw)));
    else throw new XlsxError('Excel con compresión no soportada');
  }
  return files;
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

/** Text of all <t> runs inside a fragment (shared string or inline string, plain or rich text). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');

/** Every sheet's rows, sheets in file order. */
export function readXlsx(data: Uint8Array): SheetRow[][] {
  const files = readZip(data);
  const decoder = new TextDecoder();
  const sharedXml = files.get('xl/sharedStrings.xml');
  const shared = sharedXml ? [...decoder.decode(sharedXml).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const sheetNames = [...files.keys()]
    .filter((n) => n.startsWith('xl/worksheets/'))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (sheetNames.length === 0) throw new XlsxError('El Excel no tiene hojas');

  return sheetNames.map((name) => {
    const xml = decoder.decode(files.get(name)!);
    const rows: SheetRow[] = [];
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1);
      const cells: Record<string, string> = {};
      for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1];
        const body = cell[2] ?? '';
        const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
        if (!ref) continue;
        const type = attrs.match(/\bt="([^"]+)"/)?.[1];
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value: string | undefined;
        if (type === 's' && v !== undefined) value = shared[Number(v)];
        else if (type === 'inlineStr') value = textOf(body);
        else if (v !== undefined) value = unescapeXml(v);
        if (value !== undefined && value.trim() !== '') cells[ref] = value.trim();
      }
      if (Object.keys(cells).length) rows.push({ row: rowNumber, cells });
    }
    return rows;
  });
}
