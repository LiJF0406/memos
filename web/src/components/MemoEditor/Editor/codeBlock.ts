import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import { CodeBlockNodeView } from "./CodeBlockNodeView";

// The same language set the read-only memo view highlights (MemoContent/CodeBlock.tsx),
// including the aliases highlight.js ships (ts->typescript, sh->shell, ...).
const languageGrammars = {
  bash,
  c,
  cpp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  markdown,
  python,
  rust,
  shell,
  sql,
  typescript,
  xml,
  yaml,
} as const;

const languageAliases: Record<string, keyof typeof languageGrammars> = {
  js: "javascript",
  sh: "shell",
  ts: "typescript",
  html: "xml",
  yml: "yaml",
  md: "markdown",
};

function buildLowlight(): ReturnType<typeof createLowlight> {
  const lowlight = createLowlight(languageGrammars);
  for (const [alias, target] of Object.entries(languageAliases)) {
    lowlight.register(alias, languageGrammars[target]);
  }
  return lowlight;
}

/**
 * Code-block node for the WYSIWYG editors, sharing the read-only rendering
 * (language header + copy button + syntax highlighting) via a React node view.
 * Built on @tiptap/extension-code-block-lowlight so highlight.js decorations
 * apply to the editable text without breaking the ProseMirror document model.
 *
 * `configure({ lowlight })` is applied in buildExtensions so both the memo and
 * note editor and the headless markdown codec use the identical language set.
 */
export const NoteCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({ lowlight: buildLowlight() });
