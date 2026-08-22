import { type Editor, Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { createElement } from "react";
import { createSuggestionRenderer } from "./suggestionMenu";

export interface SlashCommandItem {
  name: string;
  apply: (editor: Editor, range: Range) => void;
}

// WYSIWYG counterparts of the raw editor's commands (Editor/commands.ts):
// the same four entries, realized as editor commands instead of raw strings.
export const slashCommandItems: SlashCommandItem[] = [
  {
    name: "todo",
    apply: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    name: "code",
    apply: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    name: "link",
    // After deleteRange + insertContent the marked text node "text" occupies
    // positions range.from..range.from+4. Select it so the user can overtype
    // the display text immediately — matching the textarea editor's cursorOffset=1.
    apply: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent("[text](url)", { contentType: "markdown" })
        .setTextSelection({ from: range.from, to: range.from + 4 })
        .run(),
  },
  {
    name: "table",
    apply: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent("| Header | Header |\n| ------ | ------ |\n| Cell   | Cell |", { contentType: "markdown" })
        .run();
      // Place the cursor on the first header cell's text (matching the raw
      // editor's first-header-cell placement). Scope the search to positions
      // at/after the insertion point (range.from) so preceding prose does not
      // steal the cursor — the table is inserted exactly at range.from.
      let targetPos: number | undefined;
      editor.state.doc.descendants((node, pos) => {
        if (targetPos !== undefined) {
          return false;
        }
        if (pos < range.from) {
          return true;
        }
        if (node.isText && node.text) {
          targetPos = pos;
          return false;
        }
        return true;
      });
      if (targetPos !== undefined) {
        editor.commands.setTextSelection(targetPos);
      }
    },
  },
];

/**
 * Returns the subset of slash commands whose name starts with `query`
 * (case-insensitive). Returns the full list when `query` is empty.
 */
export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.toLowerCase();
  return q ? slashCommandItems.filter((item) => item.name.startsWith(q)) : slashCommandItems;
}

/** `/` command popup; replaces the raw editor's SlashCommands in WYSIWYG mode. */
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        allowSpaces: false,
        items: ({ query }) => filterSlashCommands(query),
        command: ({ editor, range, props: item }) => {
          item.apply(editor, range);
        },
        render: createSuggestionRenderer<SlashCommandItem>({
          getItemKey: (item) => item.name,
          renderItem: (item) =>
            createElement(
              "span",
              { className: "tracking-wide" },
              createElement("span", { className: "text-muted-foreground" }, "/"),
              item.name,
            ),
        }),
      }),
    ];
  },
});
