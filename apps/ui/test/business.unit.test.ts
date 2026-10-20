/**
 * P6.14 UI units: the intake form of each business template is drawn from its spec (every field in order, the required
 * markers, selects, the depth tiers, the signed-in sources, the materials zone), the Home chips list them, and the
 * follow-up chips are the template's.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TEMPLATES, specOf, type TemplateId } from '@orb/shared';
import { IntakeForm } from '../src/screens/Home/IntakeForm.js';
import { BUSINESS_IDS } from '../../../packages/shared/test/businessIntakes.js';

describe.each(BUSINESS_IDS)('the %s intake form', (id) => {
  const spec = specOf(id as TemplateId)!;
  const out = renderToStaticMarkup(
    createElement(IntakeForm, { spec, onSubmit: () => undefined, onCancel: () => undefined, initial: 'Acme' }),
  );

  it("is a dialog that shows every field of the spec, in the spec's order", () => {
    expect(out).toContain('role="dialog"');
    expect(out).toContain(spec.label);
    for (const f of spec.inputs) expect(out, f.label).toContain(f.label);
    const order = spec.inputs.map((f) => out.indexOf(f.label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('marks the required fields, prefills the subject and offers the select options', () => {
    for (const f of spec.inputs.filter((x) => x.required && x.kind !== 'depth'))
      expect(out, f.id).toMatch(new RegExp(`data-testid="intake-${f.id}"[^>]*aria-required="true"`));
    expect(out).toContain('value="Acme"');
    for (const f of spec.inputs.filter((x) => x.kind === 'select'))
      for (const o of f.options ?? []) expect(out).toContain(`>${o}</option>`);
  });

  it('shows the three depth tiers, the signed-in sources and the materials zone', () => {
    for (const d of ['quick', 'standard', 'deep']) expect(out).toContain(`data-testid="intake-depth-${d}"`);
    for (const s of spec.signedIn) expect(out).toContain(s.label);
    expect(out).toContain('data-testid="intake-file-input"');
  });

  it('is a Home chip with the placeholder of the template', () => {
    const chip = TEMPLATES.find((t) => t.id === id)!;
    expect(chip.spec).toBe(spec);
    expect(chip.placeholder.length).toBeGreaterThan(10);
  });
});
