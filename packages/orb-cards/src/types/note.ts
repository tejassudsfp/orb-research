/** Note (Paper): the user's own text. Agents never create, edit or delete notes. */
import type { CardTypeSpec } from '../spec.js';
import { bodyOf } from '../describe.js';

export const note: CardTypeSpec<'note'> = {
  type: 'note',
  purpose: "The user's own note (Paper card). Agents never create, edit or delete notes.",
  origin: 'user',
  describe: (data) => bodyOf(data),
};
