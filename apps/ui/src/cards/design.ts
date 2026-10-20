/** Design frames (BUILD_PLAN P3.8; P6.2 pages of their own, see BuilderViews.tsx): the label of a frame's version. */

/** "Updated 14:32" (today) or "Updated 3 Oct, 14:32", the time of a design frame's current version. */
export function updatedLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now).toDateString() === d.toDateString();
  return today
    ? `Updated ${time}`
    : `Updated ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}
