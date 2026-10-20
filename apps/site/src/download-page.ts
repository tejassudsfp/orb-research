import './common.js';
import { track } from './analytics.js';
import { emailError, PLACEMENT_PATTERN } from '../shared/download-request.js';
import { RELEASE } from '../shared/release.js';

const form = document.querySelector<HTMLFormElement>('#download-form')!;
const email = document.querySelector<HTMLInputElement>('#download-email')!;
const error = document.querySelector<HTMLElement>('#download-error')!;
const submit = document.querySelector<HTMLButtonElement>('#download-submit')!;
const success = document.querySelector<HTMLElement>('#download-success')!;
const sentTo = document.querySelector<HTMLElement>('#download-sent-to')!;
const from = new URLSearchParams(location.search).get('from') ?? '';
const placement = PLACEMENT_PATTERN.test(from) ? from : 'direct';
// One id per attempt: a retry after a lost response reuses it, so Resend never sends the link twice.
let requestId = crypto.randomUUID();
let busy = false;

function showError(message: string) {
  error.textContent = message;
  error.hidden = !message;
}

// /api/download sends visitors back here when a link is expired or invalid, or the installer is unreachable.
const params = new URLSearchParams(location.search);
if (params.has('expired'))
  showError("That download link has expired or isn't valid. Enter your email and we'll send a new one.");
else if (params.has('unavailable'))
  showError('The download is temporarily unavailable. Please try your link again in a few minutes.');

form.addEventListener('input', () => {
  requestId = crypto.randomUUID();
  showError('');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const address = email.value.trim();
  const invalid = emailError(address);
  if (invalid) {
    showError(invalid);
    email.focus();
    return;
  }
  busy = true;
  submit.disabled = true;
  submit.textContent = 'Sending…';
  showError('');
  try {
    const response = await fetch('/api/download-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId,
        email: address,
        placement,
        website: (form.elements.namedItem('website') as HTMLInputElement).value,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      showError(result.error ?? 'We could not send the email. Please try again.');
      return;
    }
    track('download_requested', { version: RELEASE.version, arch: RELEASE.arch, placement });
    sentTo.textContent = address;
    form.hidden = true;
    success.hidden = false;
    success.focus();
  } catch {
    showError('We could not reach the server. Check your connection and try again.');
  } finally {
    busy = false;
    submit.disabled = false;
    submit.textContent = 'Email me the link';
  }
});

document.querySelector('#download-again')!.addEventListener('click', () => {
  requestId = crypto.randomUUID();
  form.reset();
  success.hidden = true;
  form.hidden = false;
  email.focus();
});
