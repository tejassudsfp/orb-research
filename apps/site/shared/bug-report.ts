// 3 MB keeps the whole multipart request under the 4.5 MB body limit of Vercel Functions.
export const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 5;
export const EVIDENCE_EXTENSIONS = ['log', 'txt', 'json', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'zip'];
export const BUG_FIELDS = [
  'name',
  'email',
  'title',
  'description',
  'steps',
  'expected',
  'appVersion',
  'system',
  'models',
] as const;
export type BugFields = Record<(typeof BUG_FIELDS)[number], string>;

export function evidenceError(files: ArrayLike<{ name: string; size: number }>): string | undefined {
  const entries = Array.from(files);
  if (entries.length > MAX_EVIDENCE_FILES) return 'Choose up to five evidence files.';
  if (entries.some((file) => file.size === 0)) return 'Remove empty files before sending.';
  if (entries.some((file) => !EVIDENCE_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() ?? '')))
    return 'Use logs, text, JSON, PNG, JPG, WebP, PDF or ZIP files.';
  if (entries.reduce((sum, file) => sum + file.size, 0) > MAX_EVIDENCE_BYTES)
    return 'Keep the combined attachment size under 3 MB.';
  return undefined;
}
