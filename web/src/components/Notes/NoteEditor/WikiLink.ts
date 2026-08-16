import type { MarkdownToken } from "@tiptap/core";
import { Mark, mergeAttributes } from "@tiptap/core";
import type { TokenizerThis, Tokens } from "marked";
import { marked } from "marked";

const WIKILINK_CLASS = "wikilink text-primary underline decoration-dotted underline-offset-4 cursor-pointer";

// Mirrors the backend goldmark wiki-link lexer (internal/markdown/parser/wikilink.go):
// [[title]], single line, no nested brackets, max 512 chars.
const WIKILINK_TOKEN_RULE = /^\[\[([^[\]\n]{1,512})\]\]/;

/**
 * Wiki link tokenizer, registered on the global marked singleton (same pattern
 * as Tag.ts). Kept in sync with the backend goldmark parser and the read-only
 * remark-wikilink plugin.
 */
function tokenizeWikiLink(this: TokenizerThis, src: string): Tokens.Generic | undefined {
  if (this.lexer?.state?.inLink) {
    return undefined;
  }
  const match = WIKILINK_TOKEN_RULE.exec(src);
  if (!match) {
    return undefined;
  }
  const title = match[1].trim();
  if (!title) {
    return undefined;
  }
  return { type: "wikiLink", raw: match[0], text: match[0], title };
}

let wikiLinkTokenizerRegistered = false;
function registerWikiLinkTokenizer() {
  if (wikiLinkTokenizerRegistered) {
    return;
  }
  wikiLinkTokenizerRegistered = true;
  marked.use({
    extensions: [
      {
        name: "wikiLink",
        level: "inline",
        start: (src: string) => src.indexOf("[["),
        tokenizer: tokenizeWikiLink,
      },
    ],
  });
}
registerWikiLinkTokenizer();

/**
 * Mark for `[[title]]` wiki links: styled in the editor, serialized back to
 * `[[title]]` verbatim. Modeled as a `code: true` text mark (the same
 * PreservedInline pattern as Tag.ts) so the literal syntax round-trips.
 */
export const WikiLink = Mark.create({
  name: "wikiLink",
  inclusive: false,
  code: true,

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-wikilink") ?? "",
        renderHTML: (attributes) => ({ "data-wikilink": attributes.title }),
      },
      targetType: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-target-type") ?? "",
        renderHTML: (attributes) => ({ "data-target-type": attributes.targetType }),
      },
      targetId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-target-id") ?? "",
        renderHTML: (attributes) => ({ "data-target-id": attributes.targetId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: WIKILINK_CLASS }), 0];
  },

  markdownTokenName: "wikiLink",
  parseMarkdown: (token, helpers) => {
    const t = token as MarkdownToken & { title?: string };
    return helpers.createTextNode(t.raw ?? "", [{ type: "wikiLink", attrs: { title: t.title ?? "" } }]);
  },
  // No delimiters: the literal [[title]] text carries the syntax.
  renderMarkdown: (node, helpers) => (node.content ? helpers.renderChildren(node.content) : ""),
});
