/// <reference lib="dom" />
/**
 * P5.2 accessibility helpers for the e2e specs.
 *
 * `axeScan` runs axe-core (exact-pinned devDependency of @orb/desktop) inside the live page with the WCAG 2.0/2.1
 * A + AA rule sets, which include `color-contrast` (4.5:1 for normal text, 3:1 for large text), `button-name`,
 * `label`, `link-name`, `aria-*` and `image-alt`. The source is injected with `page.evaluate` (a DevTools evaluation,
 * not a page script, so the app's CSP is untouched and nothing is fetched).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string; html: string; summary: string }[];
};

export type AxeOptions = {
  /** CSS selectors to leave out of the scan (e.g. the sandboxed design-frame iframe, which is user/agent content). */
  exclude?: string[];
  /** Only scan inside this selector. */
  include?: string;
};

export async function axeScan(page: Page, options: AxeOptions = {}): Promise<AxeViolation[]> {
  const injected = await page.evaluate(() => typeof (window as any).axe === 'object');
  if (!injected) await page.evaluate(AXE_SOURCE);
  return page.evaluate(async ({ exclude, include }) => {
    const axe = (window as any).axe;
    const context: any = {};
    if (include) context.include = [[include]];
    if (exclude?.length) context.exclude = exclude.map((s) => [s]);
    const result = await axe.run(Object.keys(context).length ? context : document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations', 'incomplete'],
      iframes: false,
    });
    // axe leaves text over gradients, glows and translucent panels as "incomplete" for color-contrast (it cannot
    // compute a background); `contrastScan` measures those from pixels. Other incomplete results are reported.
    (window as any).__orbAxeIncomplete = result.incomplete
      .filter((v: any) => v.id !== 'color-contrast')
      .map((v: any) => `${v.id}: ${v.nodes.map((n: any) => n.target.join(' ')).join(', ')}`);
    return result.violations.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n: any) => ({
        target: n.target.join(' '),
        html: String(n.html).slice(0, 200),
        summary: String(n.failureSummary ?? '').slice(0, 300),
      })),
    }));
  }, options);
}

/** A one-line-per-node report for a failing assertion. */
export function formatViolations(violations: AxeViolation[]): string {
  return violations
    .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target}\n    ${n.html}\n    ${n.summary}`))
    .join('\n');
}

/**
 * The focus ring on the focused element: a visible outline (style not none, width >= 2px) or a box-shadow ring.
 * Returns a description of the ring, or null when the focused element shows none.
 */
export async function focusRing(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el: Element | null = document.activeElement;
    if (!el || el === document.body) return null;
    // The element's own ring, or (for a bare text field inside a styled box) the ring its box draws.
    for (let e: Element | null = el, depth = 0; e && depth < 4; e = e.parentElement, depth++) {
      const s = getComputedStyle(e);
      if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2)
        return `${depth ? 'box ' : ''}outline ${s.outlineWidth} ${s.outlineColor}`;
      if (depth === 0 && /\b0px 0px 0px [2-9]/.test(s.boxShadow)) return `box-shadow ${s.boxShadow}`;
    }
    return null;
  });
}

/** A short description of the focused element (test id, else role + accessible name-ish). */
export async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    return (
      el.getAttribute('data-testid') ??
      `${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''}]`
    );
  });
}

/** Tab (or Shift+Tab) up to `max` times, collecting what got the focus, each with its focus ring. */
export async function tabWalk(
  page: Page,
  max: number,
  options: { back?: boolean; until?: (id: string) => boolean } = {},
): Promise<{ id: string; ring: string | null }[]> {
  const seen: { id: string; ring: string | null }[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(options.back ? 'Shift+Tab' : 'Tab');
    const id = await focused(page);
    seen.push({ id, ring: await focusRing(page) });
    if (options.until?.(id)) break;
  }
  return seen;
}

/** axe's non-contrast "incomplete" results of the last `axeScan` (needs review; e.g. `aria-valid-attr-value`). */
export async function axeIncomplete(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__orbAxeIncomplete ?? []);
}

export type ContrastFailure = {
  text: string;
  where: string;
  ratio: number;
  required: number;
  fg: string;
};

type TextBox = {
  text: string;
  where: string;
  fg: [number, number, number, number];
  large: boolean;
  rects: { x: number; y: number; w: number; h: number }[];
};

const luminance = (r: number, g: number, b: number) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
export const contrastRatio = (a: [number, number, number], b: [number, number, number]): number => {
  const la = luminance(...a);
  const lb = luminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Text contrast measured on the rendered pixels (WCAG 1.4.3: 4.5:1, or 3:1 for large text: >= 24px, or >= 18.66px
 * at weight >= 700). axe cannot compute a background under gradients, glows, stars and translucent panels, which is
 * most of Orb, so this does it the direct way:
 *   1. collect every visible text run on screen (an element's own text nodes, plus input values and placeholders),
 *      its text colour (alpha times the element's effective opacity) and its line boxes, keeping only runs that are
 *      on top at their centre (not under a popover or panel);
 *   2. make all text transparent and screenshot the window: what is under each run is its real background;
 *   3. blend the text colour over each background pixel and compute the ratio per pixel; a run's ratio is the 10th
 *      percentile (so a single star or a 1px border inside the box does not decide it).
 * Disabled controls are exempt (WCAG 1.4.3 "incidental": inactive user interface components), as is text inside
 * iframes (sandboxed agent/user designs) and inside elements marked `data-a11y-exempt` (e.g. print previews).
 */
export async function contrastScan(page: Page, options: { all?: boolean } = {}): Promise<ContrastFailure[]> {
  // The text boxes are measured before the screenshot and again after it: if anything moved in between (a camera
  // jump landing a frame late, a panel settling), the pixels under a box are not its background, so measure again.
  for (let attempt = 0; ; attempt++) {
    const shot = await measureAndShoot(page);
    if (!shot) return [];
    const after = await textBoxes(page);
    if (layoutKey(after) === layoutKey(shot.boxes)) return contrastFailures(shot, options);
    if (attempt >= 4) {
      const before = new Set(shot.boxes.map((b) => layoutKey([b])));
      const now = new Set(after.map((b) => layoutKey([b])));
      const moved = [
        ...after.filter((b) => !before.has(layoutKey([b]))).map((b) => `+${layoutKey([b])}`),
        ...shot.boxes.filter((b) => !now.has(layoutKey([b]))).map((b) => `-${layoutKey([b])}`),
      ];
      throw new Error(
        `contrastScan: the layout kept moving between measuring and the screenshot (${shot.boxes.length} then ${after.length}): ${moved.slice(0, 5).join(' ')}`,
      );
    }
    await page.waitForTimeout(200);
  }
}

const layoutKey = (boxes: TextBox[]) =>
  JSON.stringify(boxes.map((b) => [b.text, b.rects.map((r) => [r.x, r.y, r.w, r.h].map(Math.round))]));

function textBoxes(page: Page): Promise<TextBox[]> {
  return page.evaluate(() => {
    const out: TextBox[] = [];
    const vw = innerWidth;
    const vh = innerHeight;
    const parse = (c: string): [number, number, number, number] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const opacityOf = (el: Element | null) => {
      let o = 1;
      for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const describe = (el: Element) => {
      const tid = el.closest('[data-testid]')?.getAttribute('data-testid');
      const cls = (el.getAttribute('class') ?? '').split(' ')[0] ?? '';
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${tid ? ' in ' + tid : ''}`;
    };
    const exempt = (el: Element) =>
      !!el.closest('[data-a11y-exempt], [aria-hidden="true"], :disabled, [aria-disabled="true"]');
    const onTop = (el: Element, r: DOMRect) => {
      const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
      const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    };
    const push = (el: Element, text: string, colour: string, rects: DOMRect[]) => {
      const s = getComputedStyle(el);
      if (s.visibility !== 'visible') return;
      const fg = parse(colour);
      if (!fg) return;
      const a = fg[3] * opacityOf(el);
      if (a < 0.02) return; // gradient-clipped or deliberately invisible text
      // A Range reports the entire text even when an ellipsised label clips most of it. Measure only painted
      // pixels, rather than accidentally sampling a neighbouring coloured button behind the invisible tail.
      const clipped = rects.map((r) => {
        let left = r.left,
          right = r.right,
          top = r.top,
          bottom = r.bottom;
        for (let parent: Element | null = el; parent; parent = parent.parentElement) {
          const css = getComputedStyle(parent);
          const box = parent.getBoundingClientRect();
          if (css.overflowX !== 'visible') {
            left = Math.max(left, box.left);
            right = Math.min(right, box.right);
          }
          if (css.overflowY !== 'visible') {
            top = Math.max(top, box.top);
            bottom = Math.min(bottom, box.bottom);
          }
        }
        return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
      });
      // Partially covered text is not painted under a floating dialog/menu. Subtract those regions before
      // sampling; checking only a run's centre otherwise assigns the popup's background to hidden glyphs.
      let visible = clipped;
      for (const overlay of document.querySelectorAll('[role="dialog"], [role="menu"], [data-panel]')) {
        if (overlay.contains(el) || el.contains(overlay)) continue;
        const bounds = overlay.getBoundingClientRect();
        if (!bounds.width || !bounds.height) continue;
        visible = visible.flatMap((rect) => {
          const left = Math.max(rect.left, bounds.left),
            right = Math.min(rect.right, bounds.right);
          const top = Math.max(rect.top, bounds.top),
            bottom = Math.min(rect.bottom, bounds.bottom);
          if (right <= left || bottom <= top || onTop(el, new DOMRect(left, top, right - left, bottom - top)))
            return [rect];
          return [
            new DOMRect(rect.left, rect.top, rect.width, top - rect.top),
            new DOMRect(rect.left, bottom, rect.width, rect.bottom - bottom),
            new DOMRect(rect.left, top, left - rect.left, bottom - top),
            new DOMRect(right, top, rect.right - right, bottom - top),
          ].filter((part) => part.width > 0 && part.height > 0);
        });
      }
      const inView = visible.filter(
        (r) => r.width >= 2 && r.height >= 4 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh,
      );
      if (!inView.length || !inView.some((r) => onTop(el, r))) return;
      const size = parseFloat(s.fontSize);
      const bold = Number(s.fontWeight) >= 700;
      out.push({
        text: text.trim().slice(0, 40),
        where: describe(el),
        fg: [fg[0], fg[1], fg[2], a],
        large: size >= 24 || (bold && size >= 18.66),
        rects: inView.map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })),
      });
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const byEl = new Map<Element, Text[]>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest('script, style, noscript, iframe, svg, option')) continue;
      if (exempt(el)) continue;
      (byEl.get(el) ?? byEl.set(el, []).get(el)!).push(n as Text);
    }
    for (const [el, texts] of byEl) {
      const rects: DOMRect[] = [];
      for (const t of texts) {
        const range = document.createRange();
        range.selectNodeContents(t);
        rects.push(...Array.from(range.getClientRects()));
      }
      push(el, texts.map((t) => t.textContent).join(' '), getComputedStyle(el).color, rects);
    }
    for (const el of Array.from(document.querySelectorAll('input, textarea'))) {
      const input = el as HTMLInputElement;
      if (exempt(el) || ['checkbox', 'radio', 'range', 'file', 'hidden', 'color'].includes(input.type))
        continue;
      const r = input.getBoundingClientRect();
      // the text area of the field, inside its padding
      const s = getComputedStyle(input);
      const lineHeight = Math.min(
        parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3,
        r.height -
          parseFloat(s.paddingTop) -
          parseFloat(s.paddingBottom) -
          parseFloat(s.borderTopWidth) -
          parseFloat(s.borderBottomWidth),
      );
      const contentTop = r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
      const contentHeight =
        r.height -
        parseFloat(s.paddingTop) -
        parseFloat(s.paddingBottom) -
        parseFloat(s.borderTopWidth) -
        parseFloat(s.borderBottomWidth);
      const box = new DOMRect(
        r.left + parseFloat(s.paddingLeft),
        input.tagName === 'TEXTAREA' ? contentTop : contentTop + (contentHeight - lineHeight) / 2,
        Math.max(0, r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)),
        lineHeight,
      );
      if (input.value) push(el, input.value, s.color, [box]);
      else if (input.placeholder)
        push(el, input.placeholder, getComputedStyle(el, '::placeholder').color, [box]);
    }
    return out;
  });
}

async function measureAndShoot(page: Page): Promise<{ boxes: TextBox[]; png: PNG; scale: number } | null> {
  const boxes = await textBoxes(page);
  if (!boxes.length) return null;
  const style = await page.addStyleTag({
    content:
      '*, *::before, *::after, *::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }',
  });
  let png: PNG;
  let scale: number;
  try {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    png = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
    scale = png.width / (await page.evaluate(() => innerWidth));
  } finally {
    await style.evaluate((el) => (el as Element).remove());
    // Colours with a `transition` (0.01 ms under Reduce Motion) only come back on the next frames.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  return { boxes, png, scale };
}

function contrastFailures(
  { boxes, png, scale }: { boxes: TextBox[]; png: PNG; scale: number },
  options: { all?: boolean },
): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  for (const box of boxes) {
    const ratios: number[] = [];
    for (const r of box.rects) {
      const x0 = Math.max(0, Math.floor(r.x * scale));
      const y0 = Math.max(0, Math.floor(r.y * scale));
      const x1 = Math.min(png.width, Math.ceil((r.x + r.w) * scale));
      const y1 = Math.min(png.height, Math.ceil((r.y + r.h) * scale));
      const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 400)));
      for (let y = y0; y < y1; y += step)
        for (let x = x0; x < x1; x += step) {
          const i = (y * png.width + x) * 4;
          const bg: [number, number, number] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
          const [fr, fgG, fb, a] = box.fg;
          const fg: [number, number, number] = [
            fr * a + bg[0] * (1 - a),
            fgG * a + bg[1] * (1 - a),
            fb * a + bg[2] * (1 - a),
          ];
          ratios.push(contrastRatio(fg, bg));
        }
    }
    if (!ratios.length) continue;
    ratios.sort((a, b) => a - b);
    const ratio = ratios[Math.floor(ratios.length * 0.1)]!;
    const required = box.large ? 3 : 4.5;
    if (ratio < required || options.all)
      failures.push({
        text: box.text,
        where: box.where,
        ratio: Math.round(ratio * 100) / 100,
        required,
        fg: `rgba(${box.fg.map((v, i) => (i === 3 ? v.toFixed(2) : Math.round(v))).join(',')})`,
      });
  }
  return failures;
}

export function formatContrast(failures: ContrastFailure[]): string {
  return failures.map((f) => `${f.ratio}:1 < ${f.required}:1  "${f.text}"  ${f.where}  ${f.fg}`).join('\n');
}

export type ReachReport = {
  /** Tab stops inside the container, in DOM order. */
  stops: string[];
  /** What Tab focused, in order (a test id when it left the container). */
  order: string[];
  /** Stops never reached by Tab. */
  missed: string[];
  /** Stops reached without a visible focus ring. */
  noRing: string[];
};

/**
 * Keyboard reach: every tab stop inside `container` (visible, enabled, tabIndex >= 0; one per radio group; roving
 * toolbars count their one tab stop) is reached by pressing Tab from the container's first stop, and shows a focus
 * ring when it is. Tab presses stop when the focus leaves the container or comes back to the first stop.
 */
export async function keyboardReach(
  page: Page,
  container: string,
  options: { exclude?: string; maxTabs?: number } = {},
): Promise<ReachReport> {
  const maxTabs = options.maxTabs ?? 300;
  const stops: string[] = await page.evaluate(
    ({ container, exclude }) => {
      const root = document.querySelector(container);
      if (!root) throw new Error(`no ${container}`);
      const all = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
        ),
      );
      const seenRadio = new Set<string>();
      const out: string[] = [];
      let n = 0;
      for (const el of all) {
        if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) continue;
        if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
        if (el.closest('[inert], [aria-hidden="true"]')) continue;
        if (exclude && el.closest(exclude)) continue;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || s.visibility !== 'visible') continue;
        if (el instanceof HTMLInputElement && el.type === 'radio') {
          if (seenRadio.has(el.name)) continue;
          seenRadio.add(el.name);
          el.closest('[role="radiogroup"]')?.setAttribute('data-a11y-group', el.name);
        }
        const id = `s${n++}`;
        el.setAttribute('data-a11y-stop', id);
        if (el instanceof HTMLInputElement && el.type === 'radio')
          for (const peer of Array.from(
            root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`),
          ))
            peer.setAttribute('data-a11y-stop', id);
        out.push(id);
      }
      return out;
    },
    { container, exclude: options.exclude },
  );
  const label = (id: string) =>
    page.evaluate((id) => {
      const el = document.querySelector(`[data-a11y-stop="${id}"]`)!;
      return `${id} ${el.getAttribute('data-testid') ?? el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
    }, id);
  const reached = new Map<string, string | null>();
  const order: string[] = [];
  if (stops.length) {
    await page.evaluate(
      (id) => (document.querySelector(`[data-a11y-stop="${id}"]`) as HTMLElement).focus(),
      stops[0]!,
    );
    // Focus by script does not set :focus-visible on buttons; step out and back in with the keyboard.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    for (let i = 0; i < maxTabs; i++) {
      const { at, inside } = await page.evaluate((container) => {
        const el = document.activeElement;
        return {
          at: el?.closest('[data-a11y-stop]')?.getAttribute('data-a11y-stop') ?? null,
          inside: !!el && !!document.querySelector(container)?.contains(el),
        };
      }, container);
      order.push(at ?? (await focused(page)));
      if (!at && !inside) break;
      if (!at) {
        await page.keyboard.press('Tab');
        continue;
      }
      if (!reached.has(at)) reached.set(at, await focusRing(page));
      else if (at === stops[0] && i > 0) break;
      await page.keyboard.press('Tab');
    }
  }
  const missed = stops.filter((s) => !reached.has(s));
  const noRing = stops.filter((s) => reached.has(s) && !reached.get(s));
  const report = {
    stops: await Promise.all(stops.map(label)),
    order,
    missed: await Promise.all(missed.map(label)),
    noRing: await Promise.all(noRing.map(label)),
  };
  await page.evaluate(() =>
    document.querySelectorAll('[data-a11y-stop]').forEach((el) => el.removeAttribute('data-a11y-stop')),
  );
  return report;
}
