import { Extension } from "@tiptap/core";
import type { MarkdownManager } from "@tiptap/markdown";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const livePreviewPluginKey = new PluginKey<DecorationSet>("noteLivePreview");

/**
 * Live Preview（行级）：光标所在顶层块上方叠加显示其 Markdown 源码，
 * 其余行保持富文本渲染；点击源码条即可把光标移入该块继续编辑。
 * 绝大多数情况下顶层块（段落/标题/列表项）就是一行，符合行级语义。
 */
function buildDecorations(manager: MarkdownManager | undefined, state: EditorState, focusBlock: (pos: number) => void): DecorationSet {
  if (!manager) {
    return DecorationSet.empty;
  }
  const { $head } = state.selection;
  // 光标所在的顶层块（doc 的直接子节点）。
  if ($head.depth < 1) {
    return DecorationSet.empty;
  }
  const blockStart = $head.before(1);
  const blockEnd = $head.after(1);
  if (blockStart < 0 || blockEnd <= blockStart) {
    return DecorationSet.empty;
  }

  // 把该块序列化为 Markdown 源码文本。
  let source = "";
  try {
    const fragment = state.doc.slice(blockStart, blockEnd).toJSON();
    source = manager.serialize({ type: "doc", content: Array.isArray(fragment) ? fragment : [fragment] }).trim();
  } catch {
    return DecorationSet.empty;
  }
  if (!source) {
    return DecorationSet.empty;
  }

  const dom = document.createElement("button");
  dom.type = "button";
  dom.className = "note-live-preview-source";
  dom.textContent = source;
  dom.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    focusBlock(Math.min(blockStart + 1, Math.max(blockStart, blockEnd - 1)));
  });

  const widget = Decoration.widget(blockStart, dom, { side: -1 });
  return DecorationSet.create(state.doc, [widget]);
}

export const LivePreview = Extension.create({
  name: "noteLivePreview",

  addProseMirrorPlugins() {
    const editor = this.editor;
    const manager = editor.markdown as MarkdownManager | undefined;

    return [
      new Plugin<DecorationSet>({
        key: livePreviewPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old, newState) => {
            if (!tr.selectionSet && !tr.docChanged) {
              return old;
            }
            return buildDecorations(manager, newState, (pos) => {
              editor.commands.focus();
              editor.commands.setTextSelection(pos);
            });
          },
        },
        props: {
          decorations: (state: EditorState) => livePreviewPluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
