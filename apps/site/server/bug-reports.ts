import type { IncomingMessage, ServerResponse } from 'node:http';
import { BUG_FIELDS, evidenceError, MAX_EVIDENCE_BYTES, type BugFields } from '../shared/bug-report.js';

export const BUG_SENDER = 'orb@email.tejassuds.com';
export const BUG_RECIPIENT = 'tejas@winsen.ai';
const MAX_REQUEST = MAX_EVIDENCE_BYTES + 1024 * 1024; // 4 MB, under the Vercel 4.5 MB request limit
const HOUR = 60 * 60 * 1000;

type Mail = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
  attachments: Array<{ filename: string; content: string; content_type: string }>;
};
export type BugReportOptions = {
  getApiKey: () => string | undefined | Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  origin?: string;
  /** The visitor's address for rate limits. Behind a proxy (Vercel), read the proxy's trusted header. */
  clientIp?: (req: IncomingMessage) => string | undefined;
};
class ReportError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Best-effort removal of common credentials from report text and UTF-8 logs. */
export function scrubReportText(text: string): string {
  return text
    .replace(/dsh web:\s*\S+/gi, 'dsh web: [redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-(?:proj-|ant-)?|re_|gh[pousr]_)[A-Za-z0-9_-]{16,}/g, '[redacted]')
    .replace(
      /((?:["']?)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)(?:["']?)\s*[:=]\s*["']?)[^\s,"';]+/gi,
      '$1[redacted]',
    );
}

function reply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

async function readForm(req: IncomingMessage) {
  if (Number(req.headers['content-length']) > MAX_REQUEST)
    throw new ReportError(413, 'Keep attachments under 3 MB in total.');
  if (!req.headers['content-type']?.startsWith('multipart/form-data;'))
    throw new ReportError(415, 'Submit the bug report using the form.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk);
    bytes += part.length;
    if (bytes > MAX_REQUEST) throw new ReportError(413, 'Keep attachments under 3 MB in total.');
    chunks.push(part);
  }
  try {
    return await new Request('http://orb.invalid', {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] },
      body: new Uint8Array(Buffer.concat(chunks)).buffer,
    }).formData();
  } catch {
    throw new ReportError(400, 'The upload could not be read. Please select your files again.');
  }
}

async function emailFromForm(form: FormData): Promise<{ id: string; mail: Mail }> {
  const id = form.get('reportId');
  if (typeof id !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id))
    throw new ReportError(422, 'Refresh the form and try again.');
  if (form.get('website')) throw new ReportError(422, 'The report could not be submitted.');
  const fields = {} as BugFields;
  for (const name of BUG_FIELDS) {
    const value = form.get(name);
    if (value !== null && typeof value !== 'string') throw new ReportError(422, 'Check the report fields.');
    fields[name] = (value ?? '').trim();
    const max =
      name === 'description' || name === 'steps' || name === 'expected'
        ? 12000
        : name === 'email'
          ? 254
          : 160;
    if (fields[name].length > max) throw new ReportError(422, 'One of the report fields is too long.');
  }
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(fields.email))
    throw new ReportError(422, 'Enter a valid email so we can reply.');
  if (fields.title.length < 3 || Array.from(fields.title).some((char) => char.charCodeAt(0) < 32))
    throw new ReportError(422, 'Add a short, single-line issue title.');
  if (fields.description.length < 10)
    throw new ReportError(422, 'Describe what happened in a little more detail.');
  const evidence = form.getAll('evidence').filter((value) => typeof value !== 'string' && value.name !== '');
  if (form.getAll('evidence').some((value) => typeof value === 'string'))
    throw new ReportError(422, 'Select evidence files using the upload control.');
  const files = evidence as File[];
  const invalid = evidenceError(files);
  if (invalid) throw new ReportError(422, invalid);
  const attachments = [] as Mail['attachments'];
  for (const file of files) {
    const extension = file.name.split('.').pop()!.toLowerCase();
    const filename = Array.from(file.name, (char) =>
      char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '/' || char === '\\' ? '_' : char,
    )
      .join('')
      .slice(-150);
    let bytes = Buffer.from(await file.arrayBuffer());
    const textFile = ['log', 'txt', 'json'].includes(extension);
    if (textFile) {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new ReportError(422, 'Text logs must use UTF-8. You can attach a ZIP for other formats.');
      }
      bytes = Buffer.from(scrubReportText(text));
    }
    const types: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      pdf: 'application/pdf',
      zip: 'application/zip',
    };
    attachments.push({
      filename,
      content: bytes.toString('base64'),
      content_type: textFile ? 'text/plain' : types[extension]!,
    });
  }
  const text = [
    'Orb bug report',
    `Reference: ${id}`,
    `Submitter: ${fields.name || 'Not provided'}`,
    `Email: ${fields.email}`,
    `Orb version: ${fields.appVersion || 'Not provided'}`,
    `System: ${fields.system || 'Not provided'}`,
    `Provider / models: ${fields.models || 'Not provided'}`,
    '',
    `Issue: ${fields.title}`,
    '',
    'What happened',
    fields.description,
    '',
    'Steps to reproduce',
    fields.steps || 'Not provided',
    '',
    'Expected behavior',
    fields.expected || 'Not provided',
    '',
    `Evidence: ${attachments.map((file) => file.filename).join(', ') || 'None attached'}`,
    'Common credential patterns are redacted from report text and UTF-8 logs. Binary attachments are submitted as selected.',
  ].join('\n');
  return {
    id,
    mail: {
      from: `Orb bugs <${BUG_SENDER}>`,
      to: [BUG_RECIPIENT],
      reply_to: fields.email,
      subject: `[orb bug] ${scrubReportText(fields.title)}`,
      text: scrubReportText(text),
      attachments,
    },
  };
}

export function createBugReportHandler(options: BugReportOptions) {
  const attempts = new Map<string, { count: number; until: number }>();
  let global = { count: 0, until: 0 };
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST');
        throw new ReportError(405, 'Use the bug report form to send a report.');
      }
      let origin: URL;
      try {
        origin = new URL(req.headers.origin ?? '');
      } catch {
        throw new ReportError(403, 'Open the form on the Orb website to submit a report.');
      }
      if (
        !['http:', 'https:'].includes(origin.protocol) ||
        (options.origin ? origin.origin !== options.origin : origin.host !== req.headers.host)
      )
        throw new ReportError(403, 'Open the form on the Orb website to submit a report.');
      const now = Date.now();
      for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
      if (global.until <= now) global = { count: 0, until: now + HOUR };
      const ip = options.clientIp?.(req) || req.socket.remoteAddress || 'unknown';
      const entry = attempts.get(ip) ?? { count: 0, until: now + HOUR };
      if (entry.count >= 5 || global.count >= 60 || attempts.size >= 10000) {
        res.setHeader('retry-after', '3600');
        throw new ReportError(429, 'Too many reports right now. Please try again later.');
      }
      const apiKey = await options.getApiKey();
      if (!apiKey)
        throw new ReportError(
          503,
          'Bug reporting is temporarily unavailable. Your report has not been sent.',
        );
      const { id, mail } = await emailFromForm(await readForm(req));
      attempts.set(ip, { count: entry.count + 1, until: entry.until });
      global.count++;
      const response = await (options.fetch ?? globalThis.fetch)('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': `orb-bug/${id}`,
        },
        body: JSON.stringify(mail),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok)
        throw new ReportError(
          502,
          'The report could not be confirmed. Please try again; your draft and files are still here.',
        );
      const result = (await response.json()) as { id?: unknown };
      if (typeof result.id !== 'string' || !result.id)
        throw new ReportError(502, 'The report could not be confirmed. Please try again.');
      reply(res, 201, { reportId: id });
    } catch (error) {
      // Never return provider errors, keys, uploaded content or email bodies to the browser or logs.
      reply(res, error instanceof ReportError ? error.status : 502, {
        error:
          error instanceof ReportError
            ? error.message
            : 'The report could not be confirmed. Please try again; your draft and files are still here.',
      });
    }
  };
}
