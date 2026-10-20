/** Risk or claim: a risk, or a claim that needs checking, with why it matters. */
import { RiskData, readCardData } from '@orb/shared';
import { z } from 'zod';
import { Body, TEXT_MAP, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf } from '../describe.js';

export const risk: CardTypeSpec<'risk'> = {
  type: 'risk',
  label: 'risk or claim',
  purpose: 'A risk, or a claim that needs checking, with why it matters.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    body: Body(2000).optional(),
    kind: z.enum(['risk', 'claim']).optional(),
  }),
  fieldHelp: 'title = the risk or claim, body? = why it matters, kind? ("risk" default | "claim")',
  toData: (f, _ctx, mode) => ({
    ...pick(f, { ...TEXT_MAP, kind: 'kind' }),
    ...(mode === 'create' && f.kind === undefined ? { kind: 'risk' } : {}),
  }),
  describe: (data) => {
    const d = readCardData(RiskData, data);
    const kind = d?.kind === 'claim' ? 'Claim' : 'Risk';
    const context = bodyOf(data);
    return context ? `${kind}: ${context}` : kind;
  },
};
