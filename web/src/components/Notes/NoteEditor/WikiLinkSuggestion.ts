import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { createElement } from "react";
import { createSuggestionRenderer } from "@/components/MemoEditor/Editor/suggestionMenu";

export interface WikiLinkSuggestionItem {
  title: string;
  kind: "note" | "memo";
}

export interface WikiLinkSuggestionOptions {
  /** Getter (not a snapshot) so the popup always sees freshly fetched titles. */
  getItems: () => WikiLinkSuggestionItem[];
}

const MAX_SUGGESTIONS = 20;

/**
 * `[[` popup backed by note titles + memo titles. Inserts a wiki-link-marked
 * `[[title]]` text plus a trailing space. `[[` is detected by treating the
 * second `[` as the start of the query.
 */
export const WikiLinkSuggestion = Extension.create<WikiLinkSuggestionOptions>({
  name: "wikiLinkSuggestion",

  addOptions() {
    return { getItems: () => [] };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<WikiLinkSuggestionItem>({
        editor: this.editor,
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        char: "[",
        allowSpaces: true,
        items: ({ query }) => {
          // Only trigger on `[[`; a single `[` is a markdown link.
          if (!query.startsWith("[")) {
            return [];
          }
          const term = query.slice(1).toLowerCase();
          if (term.length === 0) {
            return [];
          }
          return this.options
            .getItems()
            .filter((item) => item.title.toLowerCase().includes(term))
            .slice(0, MAX_SUGGESTIONS);
        },
        command: ({ editor, range, props: item }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "text", text: `[[${item.title}]]`, marks: [{ type: "wikiLink", attrs: { title: item.title } }] },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: createSuggestionRenderer<WikiLinkSuggestionItem>({
          getItemKey: (item) => item.title,
          renderItem: (item) =>
            createElement(
              "span",
              { className: "truncate" },
              item.title,
              createElement("span", { className: "ml-2 text-xs text-muted-foreground" }, item.kind),
            ),
        }),
      }),
    ];
  },
});
