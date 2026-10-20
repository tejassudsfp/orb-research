/**
 * Small, valid test files built in code (no binary fixtures in the repo): a multi-page PDF with real xref offsets,
 * a PNG of any size, and the magic headers of the other image types.
 */
import { deflateSync } from 'node:zlib';
import { strToU8, zipSync } from 'fflate';

/** A valid PDF with `pages` pages (US Letter), each showing "Page n" (and `title` on page 1) in Helvetica. */
export function makePdf(pages: number, title = 'Orb test PDF'): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font, then per page: page object + content stream.
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let next = 4;
  for (let i = 1; i <= pages; i++) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const text =
      i === 1
        ? `BT /F1 36 Tf 72 680 Td (${title}) Tj ET BT /F1 24 Tf 72 620 Td (Page ${i}) Tj ET`
        : `BT /F1 24 Tf 72 620 Td (Page ${i}) Tj ET`;
    // A dark bar so the thumbnail has visible pixels near the top.
    const stream = `0.15 0.39 0.92 rg 72 720 468 24 re f ${text}`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out, 'latin1');
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A solid-colour RGB PNG of `width` × `height`. */
export function makePng(
  width: number,
  height: number,
  rgb: [number, number, number] = [37, 99, 235],
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Leading bytes of the other accepted image types (enough for the type check, not decodable images). */
export const IMAGE_HEADS = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]),
  gif: Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([26, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
};

const xmlEscape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A minimal valid .xlsx workbook (P6.3 import tests), built in code: one worksheet per entry of `sheets`, text in
 * shared strings, numbers and booleans as typed cells. `sheets[0]` is the first (active) sheet.
 */
export function makeXlsx(sheets: Record<string, (string | number | boolean | null)[][]>): Uint8Array {
  const names = Object.keys(sheets);
  const strings: string[] = [];
  const sst = (t: string) => {
    let i = strings.indexOf(t);
    if (i === -1) i = strings.push(t) - 1;
    return i;
  };
  const colName = (n: number) => String.fromCharCode(65 + n);
  const sheetXml = (rows: (string | number | boolean | null)[][]) =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">` +
          row
            .map((v, c) => {
              const ref = `${colName(c)}${r + 1}`;
              if (v === null) return '';
              if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
              if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
              return `<c r="${ref}" t="s"><v>${sst(v)}</v></c>`;
            })
            .join('') +
          '</row>',
      )
      .join('') +
    '</sheetData></worksheet>';
  const files: Record<string, Uint8Array> = {};
  names.forEach((n, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheets[n]!));
  });
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      names
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
  );
  files['_rels/.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  files['xl/workbook.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
      strings.map((t) => `<si><t xml:space="preserve">${xmlEscape(t)}</t></si>`).join('') +
      '</sst>',
  );
  return zipSync(files);
}
