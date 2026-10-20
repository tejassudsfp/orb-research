/* global process, Buffer, console */
/**
 * P6.1b brand raster step, run by scripts/brand/build.ts as an Electron main process (`electron render.mjs <jobs.json>`).
 * Each job is an SVG drawn onto a <canvas> of exactly `width`×`height` px (independent of the display scale) and saved
 * as PNG to `out`. Nothing is fetched: the page is about:blank, the SVGs are data: URLs (fonts embedded).
 */
import { app, BrowserWindow, session } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';

const jobs = JSON.parse(readFileSync(process.argv[process.argv.length - 1], 'utf8'));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, cb) =>
    cb({ cancel: !(details.url.startsWith('data:') || details.url === 'about:blank') }),
  );
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true } });
  await win.loadURL('about:blank');
  try {
    for (const job of jobs) {
      const dataUrl = await win.webContents.executeJavaScript(`(async () => {
        const img = new Image();
        img.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(job.svg).toString('base64'))};
        await img.decode();
        const c = document.createElement('canvas');
        c.width = ${job.width}; c.height = ${job.height};
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, ${job.width}, ${job.height});
        return c.toDataURL('image/png');
      })()`);
      writeFileSync(job.out, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    }
  } catch (err) {
    console.error(`render failed: ${err?.message ?? err}`);
    app.exit(1);
    return;
  }
  app.exit(0);
});
