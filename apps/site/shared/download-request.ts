/** Shared by the /download form and the /api/download-requests endpoint. */
export const EMAIL_PATTERN = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
export const MAX_EMAIL_LENGTH = 254;
/** Where on the site the visitor chose to download (a short slug, recorded in the owner notification). */
export const PLACEMENT_PATTERN = /^[a-z][a-z-]{0,23}$/;

export function emailError(email: string): string | undefined {
  if (!email) return 'Enter your email so we can send the download link.';
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return undefined;
}
