import './common.js';
import { BUG_FIELDS, evidenceError, EVIDENCE_EXTENSIONS, type BugFields, type ReportKind } from '../shared/bug-report.js';

const form = document.querySelector<HTMLFormElement>('#bug-form')!;
const input = document.querySelector<HTMLInputElement>('#bug-evidence')!;
const list = document.querySelector<HTMLElement>('#evidence-list')!;
const upload = document.querySelector<HTMLElement>('#evidence-drop')!;
const error = document.querySelector<HTMLElement>('#bug-error')!;
const submit = document.querySelector<HTMLButtonElement>('#bug-submit')!;
const success = document.querySelector<HTMLElement>('#bug-success')!;
let files: File[] = [];
let reportId = crypto.randomUUID();
let busy = false;
input.accept = EVIDENCE_EXTENSIONS.map((extension) => '.' + extension).join(',');
const title = document.querySelector<HTMLInputElement>('#bug-title')!;
const description = document.querySelector<HTMLTextAreaElement>('#bug-description')!;
const kind = (): ReportKind =>
  form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value === 'feature' ? 'feature' : 'bug';
const submitLabel = () => (kind() === 'feature' ? 'Send feature request' : 'Send bug report');
/** Bug reports ask for steps and expectations; feature requests ask what orb should do. */
function renderKind() {
  const feature = kind() === 'feature';
  for (const label of form.querySelectorAll<HTMLElement>('[data-kind-text]'))
    label.textContent = label.dataset.kindText!.split('|')[feature ? 1 : 0]!;
  for (const field of form.querySelectorAll<HTMLElement>('[data-bug-only]')) field.hidden = feature;
  title.placeholder = feature ? 'A short name for the idea' : 'A short description of the problem';
  description.placeholder = feature
    ? 'What are you trying to do? What would make it easier?'
    : 'What were you doing, and what went wrong?';
  if (!busy) submit.textContent = submitLabel();
}
for (const option of form.querySelectorAll('input[name="kind"]')) option.addEventListener('change', renderKind);
function showError(message: string) {
  error.textContent = message;
  error.hidden = !message;
}
function renderFiles() {
  list.replaceChildren();
  for (const [index, file] of files.entries()) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => {
      files.splice(index, 1);
      reportId = crypto.randomUUID();
      renderFiles();
    });
    item.append(name, remove);
    list.append(item);
  }
}
function addFiles(selected: File[]) {
  const next = [...files, ...selected];
  const invalid = evidenceError(next);
  if (invalid) {
    showError(invalid);
    return;
  }
  files = next;
  reportId = crypto.randomUUID();
  showError('');
  renderFiles();
}
input.addEventListener('change', () => {
  addFiles(Array.from(input.files ?? []));
  input.value = '';
});
upload.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!busy) upload.classList.add('drag-over');
});
upload.addEventListener('dragleave', () => upload.classList.remove('drag-over'));
upload.addEventListener('drop', (event) => {
  event.preventDefault();
  upload.classList.remove('drag-over');
  if (!busy) addFiles(Array.from(event.dataTransfer?.files ?? []));
});
form.addEventListener('input', () => {
  reportId = crypto.randomUUID();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const invalid = evidenceError(files);
  if (invalid) {
    showError(invalid);
    return;
  }
  const data = new FormData(form);
  data.set('reportId', reportId);
  data.delete('evidence');
  for (const file of files) data.append('evidence', file, file.name);
  // Retain an immutable attempt and its idempotency key if the response is lost.
  const submitted = Object.fromEntries(BUG_FIELDS.map((field) => [field, data.get(field)])) as BugFields;
  busy = true;
  submit.disabled = true;
  input.disabled = true;
  submit.textContent = 'Sending…';
  showError('');
  const fields = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
    'input, textarea, button',
  );
  for (const field of fields) field.disabled = true;
  try {
    const response = await fetch('/api/bug-reports', {
      method: 'POST',
      body: data,
      signal: AbortSignal.timeout(30000),
    });
    const result = (await response
      .json()
      .catch(() => ({
        error: 'The report service is unavailable. Please try again; your draft and files are still here.',
      }))) as { reportId?: string; error?: string };
    if (!response.ok || !result.reportId)
      throw new Error(result.error || 'The report could not be confirmed. Please try again.');
    document.querySelector('#report-reference')!.textContent = result.reportId;
    document.querySelector('#report-reply-email')!.textContent = submitted.email;
    form.hidden = true;
    success.hidden = false;
    files = [];
    renderFiles();
    form.reset();
    renderKind();
    success.focus();
  } catch (failure) {
    showError(
      failure instanceof Error && failure.name !== 'TimeoutError' && failure.name !== 'TypeError'
        ? failure.message
        : 'We could not confirm that your report was sent. Please try again; your draft and files are still here.',
    );
  } finally {
    busy = false;
    for (const field of fields) field.disabled = false;
    submit.disabled = false;
    input.disabled = false;
    submit.textContent = submitLabel();
  }
});
document.querySelector('#report-another')!.addEventListener('click', () => {
  success.hidden = true;
  form.hidden = false;
  reportId = crypto.randomUUID();
  document.querySelector<HTMLInputElement>('#bug-email')!.focus();
});
renderKind();
