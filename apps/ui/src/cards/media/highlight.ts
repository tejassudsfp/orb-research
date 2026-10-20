/**
 * Syntax highlighting for Code cards (P6.6): highlight.js core with a fixed set of languages, bundled locally (no
 * CDN, nothing fetched). `highlightCode` returns HTML that highlight.js has escaped itself, made only of `<span
 * class="hljs-…">` and text; the card's CSS colours the classes from the theme tokens.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

/** Names people write for a language, mapped to the registered one. */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  html: 'xml',
  svg: 'xml',
  yml: 'yaml',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  rb: 'ruby',
  rs: 'rust',
  golang: 'go',
  kt: 'kotlin',
  md: 'markdown',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  sqlite: 'sql',
};

/** The registered language for what the card says, or undefined (shown as plain text). */
export function languageOf(name: string | undefined): string | undefined {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return undefined;
  const lang = ALIASES[key] ?? key;
  return hljs.getLanguage(lang) ? lang : undefined;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Highlighted HTML of a snippet; an unknown or missing language gives the escaped text. */
export function highlightCode(code: string, language: string | undefined): { html: string; language?: string } {
  const lang = languageOf(language);
  if (!lang) return { html: escapeHtml(code) };
  try {
    return { html: hljs.highlight(code, { language: lang, ignoreIllegals: true }).value, language: lang };
  } catch {
    return { html: escapeHtml(code) };
  }
}
