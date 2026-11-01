import Prism from "prismjs";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-clike.js";
import "prismjs/components/prism-css.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-markup-templating.js";
import "prismjs/components/prism-markup.js";
import "prismjs/components/prism-typescript.js";

const languageAliases: Record<string, string> = {
  bash: "bash",
  css: "css",
  html: "markup",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  markup: "markup",
  md: "markup",
  plain: "text",
  sh: "bash",
  shell: "bash",
  svelte: "markup",
  text: "text",
  ts: "typescript",
  typescript: "typescript",
  xml: "markup",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeLanguage(language: string): string {
  return languageAliases[language.toLowerCase()] ?? language.toLowerCase();
}

export function highlightCode(code: string, language: string): string {
  const normalizedLanguage = normalizeLanguage(language);
  const grammar = Prism.languages[normalizedLanguage];

  if (!grammar) {
    return escapeHtml(code);
  }

  return Prism.highlight(code, grammar, normalizedLanguage);
}
