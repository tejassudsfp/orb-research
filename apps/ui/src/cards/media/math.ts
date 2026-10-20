/**
 * LaTeX for Math cards (P6.6): the bundled KaTeX renders it to HTML + MathML. `trust` is off (no \href, \includegraphics
 * or other commands that reach out), nothing is fetched, and a formula KaTeX cannot parse comes back as an error
 * message instead of a throw, so a card is never blank.
 */
import katex from 'katex';

export type MathResult = { ok: true; html: string } | { ok: false; error: string };

export function renderMath(latex: string, display = true): MathResult {
  const source = latex.trim();
  if (!source) return { ok: false, error: 'No formula yet.' };
  try {
    return {
      ok: true,
      html: katex.renderToString(source, {
        displayMode: display,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
        maxSize: 20,
        maxExpand: 1000,
      }),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.replace(/^KaTeX parse error: /, '') : 'Could not read the formula.' };
  }
}
