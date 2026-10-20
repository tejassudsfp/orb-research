import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createBugReportHandler, BUG_RECIPIENT, BUG_SENDER, scrubReportText } from '../server/bug-reports.js';
import { MAX_EVIDENCE_BYTES } from '../shared/bug-report.js';

let server: Server;
let base: string;
let key: string | undefined;
const send = vi.fn<typeof fetch>();
beforeEach(async () => {
  key = 'test-only-server-credential';
  send.mockReset().mockImplementation(async () => Response.json({ id: randomUUID() }));
  server = createServer(createBugReportHandler({ getApiKey: () => key, fetch: send }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function form() {
  const body = new FormData();
  body.set('reportId', randomUUID());
  body.set('name', 'Example Submitter');
  body.set('email', 'submitter@example.com');
  body.set('title', 'A stack cannot open');
  body.set('description', 'Open the second card in a stack. The reader does not appear.');
  body.set('steps', 'Open board, open stack, click second card.');
  body.set('expected', 'Read the complete source.');
  body.set('appVersion', '0.1.0');
  body.set('system', 'macOS, example Mac');
  body.set('models', 'Example provider/model');
  return body;
}
function post(body: FormData, origin = base) {
  return fetch(base, { method: 'POST', headers: { origin }, body });
}
function lastMail() {
  return JSON.parse(String(send.mock.calls.at(-1)![1]!.body));
}

describe('website bug-report delivery', () => {
  it('sends feature requests to the same inbox with their own subject and wording, and rejects unknown kinds', async () => {
    const body = form();
    body.set('kind', 'feature');
    body.set('title', 'Export boards to Notion');
    body.set('description', 'I keep research in Notion and would like to send a board there.');
    expect((await post(body)).status).toBe(201);
    const mail = lastMail();
    expect(mail.to).toEqual([BUG_RECIPIENT]);
    expect(BUG_RECIPIENT).toBe('projects.cases@gmail.com');
    expect(mail.subject).toBe('[orb feature] Export boards to Notion');
    expect(mail.from).toBe(`Orb features <${BUG_SENDER}>`);
    expect(mail.text).toContain('Orb feature request');
    expect(mail.text).toContain('What they would like orb to do');
    expect(mail.text).not.toContain('Steps to reproduce');
    const unknown = form();
    unknown.set('kind', 'complaint');
    expect((await post(unknown)).status).toBe(422);
  });

  it('sends the complete report and redacted evidence to the fixed inbox, with submitter Reply-To and retry idempotency', async () => {
    const body = form();
    const fakeSecret = 'sk-' + 'x'.repeat(40);
    const log = `Evidence remains readable.\nAuthorization: Bearer ${fakeSecret}\nAPI_KEY=${fakeSecret}\n`;
    body.append('evidence', new Blob([log]), 'sidecar.log');
    body.append(
      'evidence',
      new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
      'evidence.png',
    );
    body.set('to', 'unrequested@example.com');
    body.set('from', 'unrequested@example.com');
    const response = await post(body);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ reportId: body.get('reportId') });
    const mail = lastMail();
    expect(mail.from).toContain(BUG_SENDER);
    expect(mail.to).toEqual([BUG_RECIPIENT]);
    expect(mail.reply_to).toBe('submitter@example.com');
    expect(mail.subject).toBe('[orb bug] A stack cannot open');
    expect(mail.text).toContain('Example provider/model');
    expect(mail.attachments.map((file: any) => file.filename)).toEqual(['sidecar.log', 'evidence.png']);
    expect(Buffer.from(mail.attachments[0].content, 'base64').toString()).toContain(
      'Evidence remains readable.',
    );
    expect(JSON.stringify(mail)).not.toContain(fakeSecret);
    expect(Buffer.from(mail.attachments[1].content, 'base64')).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    await post(body);
    expect(send.mock.calls.map((call) => new Headers(call[1]!.headers).get('idempotency-key'))).toEqual([
      `orb-bug/${body.get('reportId')}`,
      `orb-bug/${body.get('reportId')}`,
    ]);
    expect(new Headers(send.mock.calls[0]![1]!.headers).get('authorization')).toBe(`Bearer ${key}`);
  });

  it.each(['email', 'title', 'description'] as const)(
    'requires a valid %s before contacting Resend',
    async (field) => {
      const body = form();
      body.set(field, field === 'email' ? 'bad@example.com\r\nCc: other@example.com' : '');
      const response = await post(body);
      expect(response.status).toBe(422);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('rejects foreign origins, unsupported content types, bot fields and disallowed evidence', async () => {
    expect((await post(form(), 'https://other.example')).status).toBe(403);
    expect(
      (
        await fetch(base, {
          method: 'POST',
          headers: { origin: base, 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(415);
    const bot = form();
    bot.set('website', 'https://spam.example');
    expect((await post(bot)).status).toBe(422);
    const invalid = form();
    invalid.append('evidence', new Blob(['executable']), 'bad.exe');
    expect((await post(invalid)).status).toBe(422);
    const tooMany = form();
    for (let i = 0; i < 6; i++) tooMany.append('evidence', new Blob(['log']), `${i}.log`);
    expect((await post(tooMany)).status).toBe(422);
    expect(send).not.toHaveBeenCalled();
  });

  it('bounds evidence size on the server even when browser validation is bypassed', async () => {
    const body = form();
    body.append('evidence', new Blob([new Uint8Array(MAX_EVIDENCE_BYTES + 1)]), 'large.zip');
    expect((await post(body)).status).toBe(422);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not expose credentials or provider error details and never reports failure as success', async () => {
    key = undefined;
    expect((await post(form())).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
    key = 'test-only-server-credential';
    send.mockResolvedValueOnce(
      Response.json({ message: `credential ${key}`, private: 'provider details' }, { status: 403 }),
    );
    const response = await post(form());
    expect(response.status).toBe(502);
    const result = await response.text();
    expect(result).not.toContain(key);
    expect(result).not.toContain('provider details');
    send.mockRejectedValueOnce(new Error(`network failed: ${key}`));
    const failure = await post(form());
    expect(failure.status).toBe(502);
    expect(await failure.text()).not.toContain(key);
  });

  it('limits reports before an unbounded number of email requests can be made', async () => {
    for (let i = 0; i < 5; i++) expect((await post(form())).status).toBe(201);
    const limited = await post(form());
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('3600');
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('removes common credential and sidecar token URL formats without removing useful log context', () => {
    const resend = 're_' + 'x'.repeat(32);
    const text = scrubReportText(
      `Card failed\ndsh web: http://127.0.0.1:123/token\nrefresh_token=private-token\n${resend}`,
    );
    expect(text).toContain('Card failed');
    expect(text).not.toContain('private-token');
    expect(text).not.toContain(resend);
    expect(text).not.toContain('/token');
  });
});
