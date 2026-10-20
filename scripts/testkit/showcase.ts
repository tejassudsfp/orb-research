/** Public screenshot data. Entirely invented; written only through CanvasStore in a temporary home. */
import { CanvasStore } from '@orb/canvas';
import type { AgentName, Card, CardType } from '@orb/shared';

export async function seedShowcase(home: string) {
  const store = new CanvasStore({ home, searchIndex: false });
  try {
    const meta = await store.create({ prompt: 'Repair café · pilot research (example)', start: false });
    const frames: string[] = [];
    for (const [i, title] of [
      'The opportunity',
      'Compare the approaches',
      'Make the next step clear',
    ].entries()) {
      const event = await store.command(meta.id, {
        type: 'frame.added',
        frame: {
          title,
          color: (['sky', 'rho', 'signal'] as const)[i]!,
          x: 80 + i * 470,
          y: 110,
          w: 430,
          h: 755,
        },
      });
      frames.push((event.data as { frame: { id: string } }).frame.id);
    }
    const cards: Record<string, string> = {};
    const add = async (
      key: string,
      type: CardType,
      frame: number,
      slot: number,
      data: unknown,
      role: AgentName,
      why: string,
      detail?: string,
    ) => {
      const event = await store.command(
        meta.id,
        {
          type: 'card.added',
          card: {
            type,
            frameId: frames[frame],
            x: 104 + frame * 470,
            y: 167 + slot * 334,
            w: 382,
            h: 305,
            data,
            why,
            ...(detail ? { detail } : {}),
            ...(slot === 0 ? { badge: 'must' } : {}),
          },
        } as never,
        { kind: 'agent', agent: role, model: 'example-model', sessionId: 'showcase' },
      );
      const id = (event.data as { card: Card }).card.id;
      cards[key] = id;
      return id;
    };
    const source = await add(
      'source',
      'source',
      0,
      0,
      {
        title: 'Start with a place people already know',
        url: 'https://example.org/repair-cafe/venue-notes',
        summary:
          'Example field notes: a neighborhood library offers a familiar, accessible setting for a small repair event. Confirm opening hours, insurance and available power before treating it as a viable venue.',
      },
      'scout',
      'The venue determines how cheaply and safely the idea can be tested.',
      'These are invented notes for a product demonstration. The scenario assumes a library meeting room that can host a two-hour session. No availability, insurance policy or volunteer commitment has been verified.\n\nA real investigation would save the venue policy, speak with its manager and record the date and conditions of any permission. Accessibility, transport, equipment and safe handling of electrical devices should be checked separately.',
    );
    const matrix = await add(
      'matrix',
      'matrix',
      1,
      0,
      {
        title: 'Which format should we test first?',
        criteria: [
          { name: 'Low upfront commitment', weight: 30 },
          { name: 'Ease of testing local demand', weight: 30 },
          { name: 'Volunteer coordination', weight: 20 },
          { name: 'Consistency for repeat visitors', weight: 20 },
        ],
        options: [
          {
            name: 'One-day pop-up',
            scores: [9, 9, 7, 4],
            note: 'Provisional judgment for this invented example; validate venue access and volunteer commitments.',
          },
          {
            name: 'Monthly partner venue',
            scores: [7, 8, 6, 8],
            note: 'A repeatable schedule may be useful after the first session provides evidence.',
          },
          {
            name: 'Permanent studio',
            scores: [2, 4, 5, 10],
            note: 'Adds fixed costs and an ongoing staffing obligation before demand is known.',
          },
        ],
      },
      'builder',
      'Compare the commitment and learning value of each format.',
      `The one-day pop-up is the provisional starting point in this invented scenario. Its main advantage is that it can test demand without committing to a lease. A library or community venue may reduce setup effort, but permission, insurance and suitable facilities remain prerequisites. The venue assumption comes from ${source}.\n\nScores use a 0–10 scale and express illustrative analyst judgment, not measured performance. The first two criteria carry 30% each because the immediate goal is to learn at a manageable cost. Volunteer coordination and repeat-visitor consistency carry 20% each. A permanent studio scores well on consistency only if a reliable operating team can actually sustain it.\n\nA confirmed monthly venue at low cost, several committed repair volunteers and repeat attendance after the pilot would strengthen the case for a recurring program. A studio would require a funded operating plan and enough demonstrated demand to justify its fixed costs. None of those conditions is established by this demonstration.\n\nConfirm a venue and a safe scope of repairs, recruit a small volunteer team, then run one session with a simple intake record. Review attendance, repairs completed, unresolved safety issues and volunteer feedback before agreeing the next format.`,
    );
    await add(
      'table',
      'table',
      1,
      1,
      {
        title: 'A pilot that produces useful evidence',
        columns: ['Measure', 'Record at the event'],
        rows: [
          ['Demand', 'Visitors and repair requests'],
          ['Delivery', 'Completed / referred repairs'],
          ['Capacity', 'Volunteer hours and queue'],
          ['Safety', 'Declined work and incidents'],
        ],
        totalRows: 4,
      },
      'scout',
      'A small set of observations makes the next decision easier.',
    );
    await add(
      'insight',
      'insight',
      0,
      1,
      {
        title: 'Validate the event before renting a studio',
        body: 'A single pop-up can test attendance, volunteer availability and the mix of repairs. A permanent space adds a fixed cost before those assumptions are understood. Start small, measure what happens, then decide whether to repeat.',
        citations: [source, cards.table!],
      },
      'builder',
      'A reversible first step keeps the learning cost bounded.',
    );
    await add(
      'risk',
      'risk',
      2,
      0,
      {
        title: 'Agree the safety boundary first',
        kind: 'risk',
        body: 'Electrical repairs, sharp tools and personal data on devices need clear handling rules. Confirm insurance, qualified supervision and what the team will decline. A useful pilot must be safe for visitors and volunteers.',
      },
      'critic',
      'Attendance alone cannot establish whether the event is safe to repeat.',
    );
    const diagram = await add(
      'diagram',
      'diagram',
      2,
      1,
      {
        title: 'From first session to a repeatable program',
        body: 'Confirm the basics, run a bounded test, then review the evidence.',
        mermaid:
          'flowchart TD\n  A[Confirm venue and safety] --> B[Run one small session]\n  B --> C[Review demand and delivery]\n  C --> D{Repeat?}\n  D -->|Evidence supports it| E[Plan a monthly pilot]\n  D -->|Change needed| F[Adjust the format]',
      },
      'builder',
      'Make the decision sequence visible.',
    );
    await store.command(meta.id, {
      type: 'link.added',
      link: { from: source, to: cards.insight!, type: 'supports' },
    } as never);
    await store.flush();
    return { canvasId: meta.id, matrix, diagram, cards };
  } finally {
    await store.close();
  }
}
