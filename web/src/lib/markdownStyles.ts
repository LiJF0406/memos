import { cn } from "@/lib/utils";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Per-level heading classes (size / weight / border), matching MemoContent. */
const headingLevelClasses: Record<HeadingLevel, string> = {
  1: "text-3xl font-bold border-b border-border pb-2",
  2: "text-2xl font-semibold border-b border-border pb-1.5",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
  5: "text-base font-semibold",
  6: "text-base font-medium text-muted-foreground",
};

/** Shared base classes applied to every heading level. */
const headingBaseClasses = "mt-3 mb-2 leading-tight";

/**
 * Complete heading class per level, precomputed once at module load (base +
 * per-level). headingClass is a hot path — MemoContent renders it per heading
 * and the editor's renderHTML runs it on essentially every keystroke — so the
 * cn() merge happens here, not per call.
 */
const headingClasses: Record<HeadingLevel, string> = {
  1: cn(headingBaseClasses, headingLevelClasses[1]),
  2: cn(headingBaseClasses, headingLevelClasses[2]),
  3: cn(headingBaseClasses, headingLevelClasses[3]),
  4: cn(headingBaseClasses, headingLevelClasses[4]),
  5: cn(headingBaseClasses, headingLevelClasses[5]),
  6: cn(headingBaseClasses, headingLevelClasses[6]),
};

/**
 * Single source of truth for the styling of common markdown elements rendered
 * by BOTH the read-only memo view (MemoContent) and the WYSIWYG editor
 * (MemoEditor). Each value is a complete, standalone Tailwind class string so it
 * can be dropped onto a DOM element as-is (the editor sets these via Tiptap
 * `HTMLAttributes`; MemoContent merges them with `cn`).
 *
 * These are static string literals so Tailwind's JIT scanner detects them.
 */
export const markdownStyles = {
  paragraph: "my-0 mb-2 leading-6",
  blockquote: "my-0 mb-2 border-l-4 border-primary/30 pl-3 text-muted-foreground italic",
  bulletList: "my-0 mb-2 list-outside pl-6 list-disc",
  orderedList: "my-0 mb-2 list-outside pl-6 list-decimal",
  listItem: "mt-0.5 leading-6",
  inlineCode: "font-mono text-sm bg-muted px-1 py-0.5 rounded-md",
  link: "text-primary underline decoration-primary/50 underline-offset-2 transition-colors hover:decoration-primary",
  horizontalRule: "my-2 h-0 border-0 border-b border-border",
} as const;

/**
 * Code-block styling, shared by the read-only memo view (MemoContent/CodeBlock)
 * and the WYSIWYG editor's code-block node view, so a fenced code block looks
 * identical while editing and after saving. Kept here as static literals so
 * Tailwind's JIT scanner picks them up and the two renderers cannot drift.
 */
export const codeBlockStyles = {
  frame: "relative my-2 rounded-lg border border-border bg-muted/20 overflow-hidden",
  header: "flex items-center justify-between px-2 py-1 border-b border-border bg-muted/30",
  label: "text-xs text-foreground select-none",
  copyButtonBase:
    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors duration-200 hover:bg-accent active:scale-95",
  codeWrap: "overflow-x-auto",
  code: "block px-3 py-2 text-sm leading-relaxed",
} as const;

/**
 * Table styling, shared by the read-only memo view (MemoContent/Table.tsx) and
 * the WYSIWYG editor's table rendering. The editor renders all rows inside one
 * <tbody> (prosemirror-tables schema has no separate <thead>), so the "thead"
 * look (border + muted background) is applied to the header <th> cells and the
 * row separators come from a divide-y on the <tbody> — which together match
 * the read-only table markup.
 */
export const tableStyles = {
  wrapper: "my-2 w-full overflow-x-auto rounded-lg border border-border bg-muted/20",
  table: "w-full border-collapse text-sm",
  thead: "border-b border-border bg-muted/30",
  tbody: "divide-y divide-border",
  row: "transition-colors hover:bg-accent/20",
  headerCell: "px-2 py-1 text-left align-middle text-sm font-medium text-muted-foreground",
  cell: "px-2 py-1 text-left align-middle text-sm",
} as const;

/** Complete heading class for a given level (shared base + per-level classes). */
export const headingClass = (level: HeadingLevel): string => headingClasses[level];

/**
 * Tag pill styling, shared by the read-only memo view (MemoContent/Tag.tsx) and
 * the editor's tag mark (MemoEditor/Editor/Tag.ts) so a `#tag` looks identical
 * while typing and after saving. Split into two tokens so the viewer can swap
 * `defaultColor` for an inline custom color, and so the editor — which is never
 * custom-colored and is not a filter button — takes the shape + default color
 * without the viewer's click/hover affordances.
 */
export const tagStyles = {
  /** Shape, padding, and typography — always applied. */
  base: "inline-flex items-center align-baseline px-1.5 py-0.5 text-[0.9em] leading-none font-normal rounded-full border",
  /** Default theme color, used when no custom tag color is set. */
  defaultColor: "border-primary text-primary bg-primary/15",
} as const;
