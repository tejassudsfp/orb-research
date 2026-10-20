/**
 * A valid intake for any v2 template (P6.15, extended by P6.16): the first field is the subject ("Acme Robotics"), a
 * text gets its placeholder, a required url gets a web address, a select its first option, long text, list and people
 * fields a sample, the depth is Standard and the first signed-in site is ticked.
 */
import type { IntakeAnswers, TemplateSpecV2 } from '@orb/shared';

export function sampleIntake(spec: TemplateSpecV2): IntakeAnswers {
  const out: IntakeAnswers = {};
  let subject = true;
  for (const f of spec.inputs) {
    if (f.kind === 'materials') continue;
    if (f.kind === 'text') {
      out[f.id] = subject ? 'Acme Robotics' : f.required ? 'Sample' : (f.placeholder ?? 'Sample');
      subject = false;
    } else if (f.kind === 'url') {
      if (f.required) out[f.id] = 'https://acme.com';
    } else if (f.kind === 'select') {
      if (f.options?.[0]) out[f.id] = f.options[0];
    } else if (f.kind === 'longtext') out[f.id] = 'Sample text for the field.';
    else if (f.kind === 'list') out[f.id] = ['One', 'Two'];
    else if (f.kind === 'people') out[f.id] = 'Ada Lovelace, https://linkedin.com/in/ada';
    else if (f.kind === 'sites') out[f.id] = f.sites?.[0] ? [f.sites[0].domain] : [];
    else if (f.kind === 'depth') out[f.id] = 'standard';
  }
  return out;
}
