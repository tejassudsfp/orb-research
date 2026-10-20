/**
 * P6.1b the Constellation mark and lockups in React, built from marks.ts. Colours follow the theme through the
 * `--orb-mark-*` tokens (tokens.css: full colour on Night by default, on Paper under `[data-theme='day']`) unless a
 * fixed palette is given. Below 24 px the simplified ring + bright point is drawn.
 */
import type { CSSProperties } from 'react';
import {
  BRIGHT_POINT,
  BRIGHT_R,
  CHORD,
  HEX,
  LINE_WIDTH,
  MARK_MIN_FULL,
  NODES,
  NODE_R,
  PALETTES,
  SIGNAL_POINT,
  SMALL_BRIGHT_R,
  SMALL_LINE_WIDTH,
  SMALL_PALETTES,
  VIEWBOX,
  WORDMARK,
  type PaletteName,
} from './marks.js';
import s from './brand.module.css';

const THEMED = {
  line: 'var(--orb-mark-line)',
  lineOpacity: 'var(--orb-mark-line-opacity)',
  node: 'var(--orb-mark-node)',
  signal: 'var(--orb-mark-signal)',
  bright: 'var(--orb-mark-bright)',
  ring: 'var(--orb-mark-small-ring)',
  smallBright: 'var(--orb-mark-small-bright)',
};

type MarkProps = {
  size?: number;
  /** A fixed palette; omitted, the mark follows the theme. */
  palette?: PaletteName;
  /** An accessible name; omitted, the mark is decorative. */
  label?: string;
  className?: string;
};

/** The primary hex Constellation mark. */
export function OrbMark({ size = 24, palette, label, className }: MarkProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  if (size < MARK_MIN_FULL) {
    const c = palette ? SMALL_PALETTES[palette] : { ring: THEMED.ring, bright: THEMED.smallBright };
    return (
      <svg width={size} height={size} viewBox={VIEWBOX} className={className} data-mark="small" {...a11y}>
        <path
          d={HEX}
          fill="none"
          style={{ stroke: c.ring }}
          strokeWidth={SMALL_LINE_WIDTH}
          strokeLinejoin="round"
        />
        <circle cx={BRIGHT_POINT[0]} cy={BRIGHT_POINT[1]} r={SMALL_BRIGHT_R} style={{ fill: c.bright }} />
      </svg>
    );
  }
  const p = palette ? PALETTES[palette] : THEMED;
  const line: CSSProperties = { stroke: p.line, strokeOpacity: p.lineOpacity };
  return (
    <svg width={size} height={size} viewBox={VIEWBOX} className={className} data-mark="full" {...a11y}>
      <g fill="none" style={line} strokeWidth={LINE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
        <path d={HEX} />
        <path d={CHORD} />
      </g>
      {NODES.map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={NODE_R} style={{ fill: p.node }} />
      ))}
      <circle cx={SIGNAL_POINT[0]} cy={SIGNAL_POINT[1]} r={NODE_R} style={{ fill: p.signal }} />
      <circle cx={BRIGHT_POINT[0]} cy={BRIGHT_POINT[1]} r={BRIGHT_R} style={{ fill: p.bright }} />
    </svg>
  );
}

/**
 * Mark + lowercase "orb" in Geist Bold. Horizontal for headers and the app (as the mockup's Home: 30 px mark, 22 px
 * word, letter-spacing -1 px, gap 10); stacked for the splash and covers (96 px mark over a 56 px word, gap 14).
 */
export function OrbLockup({
  layout = 'horizontal',
  markSize = layout === 'stacked' ? 96 : 30,
  palette,
  className,
  testId,
}: {
  layout?: 'horizontal' | 'stacked';
  markSize?: number;
  palette?: PaletteName;
  className?: string;
  testId?: string;
}) {
  const stacked = layout === 'stacked';
  const word = stacked ? (markSize * 56) / 96 : (markSize * 22) / 30;
  return (
    <span
      className={`${s.lockup} ${stacked ? s.stacked : s.horizontal}${className ? ` ${className}` : ''}`}
      style={{
        ['--orb-word' as string]: `${word}px`,
        gap: stacked ? (markSize * 14) / 96 : (markSize * 10) / 30,
      }}
      data-testid={testId}
      data-brand="orb"
    >
      <OrbMark size={markSize} palette={palette} />
      <span className={s.word}>{WORDMARK}</span>
    </span>
  );
}
