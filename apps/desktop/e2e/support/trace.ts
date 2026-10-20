/**
 * Chrome trace analysis for the P2.2 performance check.
 *
 * Phases are bounded by `performance.mark('<phase>:start' | '<phase>:end')` (blink.user_timing instant events) in
 * the renderer that hosts the page. Within a phase, on that renderer's compositor thread:
 * - `DrawFrame` (disabled-by-default-devtools.timeline.frame) marks each compositor frame the renderer submitted;
 *   frame time = the gap between consecutive DrawFrames, so a missed vsync shows up as a ~33 ms gap;
 * - `PipelineReporter` (cc,benchmark) begin events carry each frame's fate in `args.frame_reporter.state`
 *   (`STATE_PRESENTED_ALL`, `STATE_PRESENTED_PARTIAL`, `STATE_DROPPED`, `STATE_NO_UPDATE_DESIRED`).
 * Average fps = (DrawFrames - 1) / (last - first DrawFrame), the rate the board actually updated at.
 * Main-thread cost: the longest `RunTask`/`ThreadControllerImpl::RunTask` on CrRendererMain inside the phase.
 */
export type TraceEvent = {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  id2?: { local?: string; global?: string };
  args?: Record<string, unknown>;
};

export type PhaseSummary = {
  name: string;
  durationMs: number;
  /** Compositor frames submitted (DrawFrame). */
  presentedFrames: number;
  /** PipelineReporter frames with STATE_DROPPED. */
  droppedFrames: number;
  /** PipelineReporter frames with STATE_PRESENTED_PARTIAL (main thread missed the deadline, compositor drew). */
  partialFrames: number;
  avgFps: number;
  p50FrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  /** Frame gaps above 1.5 vsyncs (25 ms at 60 Hz). */
  longFrames: number;
  /** Longest main-thread task in the phase. */
  maxMainTaskMs: number;
  /** Main-thread tasks over 16.7 ms. */
  mainTasksOver16ms: number;
};

export type TraceSummary = {
  rendererPid: number;
  metric: string;
  phases: PhaseSummary[];
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

export function analyseTrace(events: TraceEvent[], phases: string[]): TraceSummary {
  const marks = events.filter((e) => e.cat.includes('blink.user_timing') && /:(start|end)$/.test(e.name));
  const first = marks[0];
  if (!first) throw new Error('trace: no phase marks (blink.user_timing) found');
  const pid = first.pid;
  const threadName = new Map<number, string>();
  for (const e of events)
    if (e.ph === 'M' && e.name === 'thread_name' && e.pid === pid)
      threadName.set(e.tid, String(e.args?.['name']));
  const mainTid = first.tid;
  const compositorTids = new Set([...threadName].filter(([, n]) => n === 'Compositor').map(([tid]) => tid));

  const draws = events
    .filter(
      (e) =>
        e.pid === pid && e.name === 'DrawFrame' && (compositorTids.size === 0 || compositorTids.has(e.tid)),
    )
    .map((e) => e.ts)
    .sort((a, b) => a - b);
  const reports = events.filter((e) => e.pid === pid && e.name === 'PipelineReporter' && e.ph === 'b');
  const tasks = events.filter(
    (e) =>
      e.pid === pid &&
      e.tid === mainTid &&
      e.ph === 'X' &&
      (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask'),
  );

  const summary = phases.map((name): PhaseSummary => {
    const start = marks.find((m) => m.name === `${name}:start`)?.ts;
    const end = marks.find((m) => m.name === `${name}:end`)?.ts;
    if (start === undefined || end === undefined)
      throw new Error(`trace: phase ${name} has no start/end mark`);
    const inPhase = (ts: number) => ts >= start && ts <= end;
    const d = draws.filter(inPhase);
    const gaps: number[] = [];
    for (let i = 1; i < d.length; i++) gaps.push((d[i]! - d[i - 1]!) / 1000);
    const sorted = [...gaps].sort((a, b) => a - b);
    const states = reports
      .filter((e) => inPhase(e.ts))
      .map((e) => (e.args?.['frame_reporter'] as { state?: string } | undefined)?.state ?? '');
    const span = d.length > 1 ? (d[d.length - 1]! - d[0]!) / 1e6 : 0;
    const taskMs = tasks.filter((t) => inPhase(t.ts)).map((t) => (t.dur ?? 0) / 1000);
    return {
      name,
      durationMs: round((end - start) / 1000, 1),
      presentedFrames: d.length,
      droppedFrames: states.filter((s) => s === 'STATE_DROPPED').length,
      partialFrames: states.filter((s) => s === 'STATE_PRESENTED_PARTIAL').length,
      avgFps: span > 0 ? round((d.length - 1) / span, 1) : 0,
      p50FrameMs: round(percentile(sorted, 50)),
      p95FrameMs: round(percentile(sorted, 95)),
      p99FrameMs: round(percentile(sorted, 99)),
      maxFrameMs: round(sorted[sorted.length - 1] ?? 0),
      longFrames: gaps.filter((g) => g > 25).length,
      maxMainTaskMs: round(Math.max(0, ...taskMs)),
      mainTasksOver16ms: taskMs.filter((t) => t > 16.7).length,
    };
  });
  return {
    rendererPid: pid,
    metric:
      'Frame time = gap between consecutive DrawFrame events on the page renderer compositor thread within each phase; ' +
      'avgFps = (frames - 1) / span; dropped/partial from PipelineReporter states.',
    phases: summary,
  };
}

/**
 * Keep only what the summary is computed from, for committing: the page renderer's frame events (DrawFrame,
 * PipelineReporter, BeginFrame), main-thread tasks and frame stages, and the phase marks, between the first and last
 * mark. Per-element `Paint` events and the duplicate `ThreadControllerImpl::RunTask` are dropped.
 */
export function slimTrace(events: TraceEvent[], rendererPid: number): TraceEvent[] {
  const marks = events.filter((e) => e.pid === rendererPid && e.cat.includes('blink.user_timing'));
  const from = Math.min(...marks.map((m) => m.ts)) - 50_000;
  const to = Math.max(...marks.map((m) => m.ts)) + 50_000;
  const mainTid = marks[0]?.tid;
  const frame = new Set(['DrawFrame', 'PipelineReporter', 'BeginFrame', 'BeginMainThreadFrame']);
  const main = new Set([
    'RunTask',
    'FireAnimationFrame',
    'EventDispatch',
    'UpdateLayoutTree',
    'Layout',
    'PrePaint',
    'Layerize',
    'Commit',
  ]);
  return events.filter(
    (e) =>
      (e.ph === 'M' && e.pid === rendererPid) ||
      (e.pid === rendererPid &&
        e.ts >= from &&
        e.ts <= to &&
        (frame.has(e.name) ||
          e.cat.includes('blink.user_timing') ||
          (e.tid === mainTid && main.has(e.name)))),
  );
}
