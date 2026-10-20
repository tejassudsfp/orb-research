// Child process for crash.test.ts: writes board events through the BUILT CanvasStore as fast as a 1 ms interval
// allows, until the parent kills it with SIGKILL. Never exits on its own.
import process from 'node:process';
import { setInterval } from 'node:timers';
import { CanvasStore } from '../../lib/index.js';

const [home, flushMs] = process.argv.slice(2);
const store = new CanvasStore({ home, ...(flushMs ? { flushMs: Number(flushMs) } : {}) });
const meta = await store.create({ prompt: 'Crash test' });
const added = await store.command(meta.id, {
  type: 'card.added',
  card: { type: 'note', x: 0, y: 0, w: 100, h: 80, data: { text: 'moving' } },
});
const cardId = added.data.card.id;
let x = 0;
setInterval(() => {
  for (let k = 0; k < 3; k++) void store.command(meta.id, { type: 'card.moved', id: cardId, x: ++x, y: 0 });
}, 1);
process.stdout.write(`${JSON.stringify({ ready: true, id: meta.id, cardId })}\n`);
