/**
 * P5.2 arrow keys for the `role="radiogroup"` button groups (first-run providers, composer segments, selection bar
 * groups, reading badges): ArrowRight / ArrowDown pick the next option, ArrowLeft / ArrowUp the previous one
 * (wrapping), Home / End the first / last, moving the focus with the choice (WAI-ARIA radio group). Every option
 * stays a tab stop too, so Tab still walks them one by one.
 */
import type { KeyboardEvent } from 'react';

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function radioKeys(e: KeyboardEvent<HTMLElement>): void {
  if (!(e.key in STEP) && e.key !== 'Home' && e.key !== 'End') return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')];
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0 || radios.length === 0) return;
  const n = radios.length;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (at + STEP[e.key]! + n) % n;
  e.preventDefault();
  // The board's own arrow-key handling (nudging the selection) must not see it.
  e.stopPropagation();
  radios[next]!.focus();
  radios[next]!.click();
}
