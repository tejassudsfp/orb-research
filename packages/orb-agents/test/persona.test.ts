import { describe, expect, it } from 'vitest';
import { CardType, PLACEABLE_TYPES } from '@orb/shared';
import {
  CHILD_PERSONAS,
  CRITIC_PERSONA,
  ORB_PERSONA,
  SCOUT_PERSONA,
  apply as applyPersonaRow,
  assignmentMessage,
  newCanvasMessage,
} from '../src/persona.js';

describe('ORB_PERSONA (BUILD_PLAN P3.3)', () => {
  it('holds the role, frame proposals, card citing, typed cards and delegation', () => {
    expect(ORB_PERSONA).toContain('You are orb, a research partner');
    expect(ORB_PERSONA).toMatch(/propose 3 to 5 frames/);
    expect(ORB_PERSONA).toContain('add_frame');
    expect(ORB_PERSONA).toContain('start Scout and Critic with delegate');
    expect(ORB_PERSONA).toContain('unless the user said otherwise');
    expect(ORB_PERSONA).toContain('Always cite cards');
    expect(ORB_PERSONA).toContain('Never write a prose card when a typed card fits');
    expect(ORB_PERSONA).toContain('Use delegate for research');
    // P5.6: in a live run Orb once wrote the critique itself and Critic placed nothing.
    expect(ORB_PERSONA).toContain("Leave your team's work to it");
    expect(ORB_PERSONA).toContain("Never change or delete the user's notes");
    // No shell or filesystem talk, no coordinates.
    expect(ORB_PERSONA).not.toMatch(/\b(bash|shell|terminal|file system)\b/i);
  });

  it('the row hands the persona to dsh-persona as the complete prompt, without runtime context', () => {
    const sections: Array<{ name: string; text: string; complete?: boolean }> = [];
    let suppressed = 0;
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      systemPrompt: {
        section: (s: { name: string; text: string; complete?: boolean }) => void sections.push(s),
        getSectionOrder: () => 0,
        suppressRuntimeContext: () => void suppressed++,
      },
    };
    applyPersonaRow(ctx);
    expect(sections[0]).toMatchObject({ text: ORB_PERSONA, complete: true });
    expect(sections[1]).toMatchObject({ text: '' });
    expect(suppressed).toBe(1);
  });
});

describe('newCanvasMessage', () => {
  it('answers a capability question about Orb without researching unrelated products', () => {
    const text = newCanvasMessage({ title: 'Hey! What can you do?' }, 'Hey! What can you do?', []);
    expect(text).toContain('This asks about orb itself');
    expect(text).not.toContain('Propose 3 to 5 frames');
    expect(text).toContain('do not research unrelated products named orb');
  });
  it('a plain question: propose 3–5 frames, then start Scout and Critic unless told otherwise', () => {
    const text = newCanvasMessage({ title: 'X' }, 'A canvas for founders', []);
    expect(text).toContain("New canvas. The user's question: A canvas for founders");
    expect(text).toContain('Propose 3 to 5 frames for this question with add_frame');
    expect(text).toContain('start Scout and Critic with delegate unless the question says otherwise');
  });

  it('a template canvas lists its frames and does not ask for new ones', () => {
    const text = newCanvasMessage({ title: 'Acme', template: 'topic', brief: 'Plan the launch.' }, 'Acme', [
      { id: 'f_1', title: 'Audience' },
      { id: 'f_2', title: 'Positioning' },
    ]);
    expect(text).toContain('They started from the "Topic deep dive" template. Its brief: Plan the launch.');
    expect(text).toContain('- 01 "Audience" [f_1]\n- 02 "Positioning" [f_2]');
    expect(text).toContain('Start Scout and Critic with delegate on these frames');
    expect(text).not.toContain('Propose 3 to 5 frames');
  });

  it('a seeded canvas asks what the user wants to understand first', () => {
    const one = newCanvasMessage(
      { title: 'x', seed: { kind: 'url', name: 'https://example.org', count: 1 } },
      'x',
      [],
    );
    expect(one).toContain('from material: a link, "https://example.org". It is placed on the board');
    expect(one).toContain('ask in one or two sentences what they want to understand');
    expect(one).not.toContain('Propose 3 to 5 frames');
    const many = newCanvasMessage({ title: 'x', seed: { kind: 'file', name: 'a.pdf', count: 3 } }, 'x', []);
    expect(many).toContain('a file, "a.pdf" (and 2 more items)');
  });
});

describe('a v2 template canvas (P6.11)', () => {
  const frames = [
    { id: 'f_team', title: 'Founders & team' },
    { id: 'f_market', title: 'Market' },
    { id: 'f_risks', title: 'Risks & red flags' },
  ];
  const meta = {
    title: 'Acme: VC due diligence',
    template: 'vc-dd' as const,
    brief: 'Run a full venture due diligence.',
    depth: 'quick' as const,
    intake: { company: 'Acme', website: 'https://acme.com', thesis: 'Robots' },
  };

  it("Orb's first turn carries the intake, the tier, the rubric and the memo, and says the frames hold seeds", () => {
    const text = newCanvasMessage(meta, 'Acme: VC due diligence', frames);
    expect(text).toContain('They started from the "VC due diligence" template.');
    expect(text).toContain('- Company name: Acme');
    expect(text).toContain('Depth: Quick scan');
    expect(text).toContain('Team (25%)');
    expect(text).toContain('Investment memo: Acme');
    expect(text).toContain('The frames hold seed cards');
    expect(text).not.toContain('Start Scout and Critic with delegate on these frames');
  });

  it("a child's FIRST assignment carries its playbook; a later one does not; the persona never does", () => {
    const delegated = [{ id: 'f_team', number: 2, title: 'Founders & team' }];
    const first = assignmentMessage('scout', delegated, 'Start with the founders.', true, meta);
    expect(first).toMatch(/Research date: \d{4}-\d{2}-\d{2} \(UTC\)/);
    expect(first).toContain('dates relevant to this brief');
    expect(first).not.toContain('travel/event dates');
    expect(first).toContain('Your playbook, in this order:');
    expect(first).toContain('"Founders & team" [f_team]');
    const later = assignmentMessage('scout', delegated, 'Now the market.', false, meta);
    expect(later).not.toContain('playbook');
    expect(SCOUT_PERSONA).not.toMatch(/playbook/i);
    expect(CRITIC_PERSONA).not.toMatch(/red-flag checklist/i);
    const critic = assignmentMessage('critic', delegated, 'Review.', true, meta);
    expect(critic).toContain('RF01');
  });

  it('a v1 template or a plain canvas is unchanged', () => {
    const plain = assignmentMessage('scout', [{ id: 'f_1', number: 1, title: 'A' }], 'Go.', true, {
      title: 'T',
      brief: 'b',
    });
    expect(plain).not.toContain('playbook');
  });
});

describe('personas at scale (P6.8)', () => {
  const personas = { orb: ORB_PERSONA, ...CHILD_PERSONAS } as const;

  it('stay compact: a persona is part of every request, so its size is budgeted', () => {
    // Characters (about 4 per token). These are ceilings with headroom, not targets; a new card type adds one line.
    const budget = { orb: 8_000, scout: 8_200, critic: 4_000, builder: 4_600 } as const;
    for (const [role, text] of Object.entries(personas))
      expect(text.length, `${role}: ${text.length} characters`).toBeLessThanOrEqual(
        budget[role as keyof typeof budget],
      );
  });

  it('every persona teaches the reading ladder: board_map, search_board, read_card, query_dataset', () => {
    for (const [role, text] of Object.entries(personas)) {
      for (const tool of ['board_map', 'search_board', 'read_card', 'query_dataset'])
        expect(text, `${role} ${tool}`).toContain(tool);
    }
  });

  it('lists each card type the role may place with when to use it, and no type it may not', () => {
    for (const role of ['orb', 'scout', 'critic', 'builder'] as const) {
      for (const type of CardType.options) {
        const told = personas[role].includes(`\n- ${type}: `);
        expect(told, `${role} ${type}`).toBe(PLACEABLE_TYPES[role].includes(type));
      }
    }
  });

  it('layout rules: orb owns the whole-board tools, children arrange only their own cards', () => {
    expect(ORB_PERSONA).toContain('reorder_frames');
    expect(ORB_PERSONA).toContain('tidy_board');
    expect(ORB_PERSONA).toContain('never move');
    for (const text of [CHILD_PERSONAS.scout, CHILD_PERSONAS.critic, CHILD_PERSONAS.builder]) {
      expect(text).toContain('move_card and arrange_frame work on your own cards only');
      expect(text).not.toContain('tidy_board');
      expect(text).not.toContain('reorder_frames');
    }
  });

  it('never name a forbidden tool and never depend on the turn (static text)', () => {
    for (const text of Object.values(personas)) {
      expect(text).not.toMatch(/\b(bash|shell|terminal|file system)\b/i);
      expect(text).not.toMatch(/c_[0-9A-Z]{10,}|f_[0-9A-Z]{10,}|20\d\d-\d\d-\d\d/);
    }
  });
});
