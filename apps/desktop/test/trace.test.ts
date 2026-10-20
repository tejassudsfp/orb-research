import { describe, expect, it } from 'vitest';
import { analyseTrace, slimTrace, type TraceEvent } from '../e2e/support/trace.ts';

const PID = 7;
const MAIN = 1;
const COMP = 2;
const ev = (e: Partial<TraceEvent> & Pick<TraceEvent, 'name' | 'ts'>): TraceEvent => ({
  cat: 'disabled-by-default-devtools.timeline.frame',
  ph: 'I',
  pid: PID,
  tid: COMP,
  ...e,
});

function synthetic(frameMs: number[], startTs = 1_000_000): TraceEvent[] {
  const events: TraceEvent[] = [
    {
      name: 'thread_name',
      cat: '__metadata',
      ph: 'M',
      ts: 0,
      pid: PID,
      tid: MAIN,
      args: { name: 'CrRendererMain' },
    },
    {
      name: 'thread_name',
      cat: '__metadata',
      ph: 'M',
      ts: 0,
      pid: PID,
      tid: COMP,
      args: { name: 'Compositor' },
    },
    ev({ name: 'pan:start', cat: 'blink.user_timing', tid: MAIN, ts: startTs }),
  ];
  let ts = startTs + 1000;
  events.push(ev({ name: 'DrawFrame', ts }));
  for (const ms of frameMs) {
    ts += ms * 1000;
    events.push(ev({ name: 'DrawFrame', ts }));
    events.push(
      ev({
        name: 'PipelineReporter',
        ph: 'b',
        ts,
        args: { frame_reporter: { state: ms > 25 ? 'STATE_DROPPED' : 'STATE_PRESENTED_ALL' } },
      }),
    );
    events.push(
      ev({ name: 'RunTask', cat: 'toplevel', ph: 'X', tid: MAIN, ts, dur: ms > 25 ? 30_000 : 3_000 }),
    );
  }
  // Another process's frames never count.
  events.push(ev({ name: 'DrawFrame', pid: 99, ts: startTs + 5000 }));
  events.push(ev({ name: 'pan:end', cat: 'blink.user_timing', tid: MAIN, ts: ts + 500 }));
  return events;
}

describe('trace analysis (P2.2 perf check)', () => {
  it('computes frame-time percentiles and fps from DrawFrame gaps of the page renderer', () => {
    const gaps = [...Array<number>(95).fill(16.67), ...Array<number>(5).fill(33.33)];
    const { phases, rendererPid } = analyseTrace(synthetic(gaps), ['pan']);
    expect(rendererPid).toBe(PID);
    const pan = phases[0]!;
    expect(pan.presentedFrames).toBe(101);
    expect(pan.p50FrameMs).toBeCloseTo(16.67, 1);
    expect(pan.p95FrameMs).toBeCloseTo(16.67, 1);
    expect(pan.p99FrameMs).toBeCloseTo(33.33, 1);
    expect(pan.longFrames).toBe(5);
    expect(pan.droppedFrames).toBe(5);
    expect(pan.avgFps).toBeCloseTo(100 / ((95 * 16.67 + 5 * 33.33) / 1000), 0);
    expect(pan.maxMainTaskMs).toBe(30);
    expect(pan.mainTasksOver16ms).toBe(5);
  });

  it('a janky phase fails the 60 fps criteria', () => {
    const { phases } = analyseTrace(synthetic(Array<number>(100).fill(33.33)), ['pan']);
    expect(phases[0]!.p95FrameMs).toBeGreaterThan(20);
    expect(phases[0]!.avgFps).toBeLessThan(55);
  });

  it('throws without phase marks; slimming keeps the events the summary needs', () => {
    expect(() => analyseTrace([], ['pan'])).toThrow(/no phase marks/);
    const events = synthetic([16.67, 16.67]);
    const slim = slimTrace(events, PID);
    expect(slim.some((e) => e.pid === 99)).toBe(false);
    expect(analyseTrace(slim, ['pan'])).toEqual(analyseTrace(events, ['pan']));
  });
});
