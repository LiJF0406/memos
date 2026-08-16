import { type MarkdownToken, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageNodeView } from "./ImageNodeView";

// Matches the read-only Image component (MemoContent/markdown/Image.tsx).
export const IMAGE_CLASS = "max-w-full h-auto my-2 rounded";

/**
 * Image node for the notes editor, with @tiptap/markdown support so
 * `![alt](url)` parses into a real image node and serializes back
 * byte-identically. Without this extension marked's image token is degraded
 * to its alt text and the syntax is lost on save. The NodeView adds a hover
 * edit button so the URL/alt can be changed without retyping the syntax.
 */
export const Image = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src"),
        renderHTML: (attributes) => ({ src: attributes.src }),
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute("alt"),
        renderHTML: (attributes) => ({ alt: attributes.alt }),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("title"),
        renderHTML: (attributes) => ({ title: attributes.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { class: IMAGE_CLASS })];
  },

  markdownTokenName: "image",
  parseMarkdown: (token, helpers) => {
    const t = token as MarkdownToken & { href?: string; text?: string; title?: string | null };
    return helpers.createNode("image", {
      src: t.href ?? "",
      alt: t.text ?? "",
      title: t.title ?? null,
    });
  },
  renderMarkdown: (node, _helpers) => {
    const src = node.attrs?.src ?? "";
    const alt = node.attrs?.alt ?? "";
    const title = node.attrs?.title;
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  },
});
