import yaml from 'js-yaml';

export type Row = { id?: string; name?: string; disabled?: unknown; config?: unknown };

const JsType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: (src: string) => ({ js: src }),
});
const schema = yaml.DEFAULT_SCHEMA.extend([JsType]);

/** Parse `dsh --dump-config` output. `!!js` values come back as `{js: source}`. */
export function parseDump(text: string): Row[] {
  return (yaml.load(text, { schema }) as Row[]) ?? [];
}

/** A row counts as enabled unless `disabled: true` or a `!!js` disable. Dynamic disables are reported as such. */
export function enabledState(row: Row): 'enabled' | 'disabled' | 'dynamic' {
  if (row.disabled === true) return 'disabled';
  if (row.disabled && typeof row.disabled === 'object') return 'dynamic';
  return 'enabled';
}
