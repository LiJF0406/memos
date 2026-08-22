import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { AUTO_PAIRS, PURE_CLOSERS, resolveAutoPair, shouldDeletePair } from "../utils/auto-pair";

// 从文档光标附近提取上下文。textBetween 的 leafText 传空串：hardbreak 等
// 内联原子节点贡献空字符，自然被当作边界处理。
function getContext(editor: Editor): { prevChar: string; nextChar: string; selectedText: string } | null {
  const { state } = editor;
  const { from, to } = state.selection;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  // 仅处理同一文本块内的选区，跨块行为保持默认
  if (!$from.sameParent($to) || !$from.parent.isTextblock) {
    return null;
  }
  return {
    prevChar: state.doc.textBetween(Math.max(0, from - 1), from, "", ""),
    nextChar: state.doc.textBetween(to, Math.min(state.doc.content.size, to + 1), "", ""),
    selectedText: state.doc.textBetween(from, to, "", ""),
  };
}

function dispatch(editor: Editor, tr: Transaction): void {
  editor.view.dispatch(tr);
}

function handlePairKey(editor: Editor, input: string): boolean {
  // IME 组合期不拦截（与同步逻辑里 view.composing 防护一致）
  if (editor.view.composing) {
    return false;
  }
  const context = getContext(editor);
  if (!context) {
    return false;
  }
  const { from, to } = editor.state.selection;
  const action = resolveAutoPair(input, context.prevChar, context.nextChar, context.selectedText);
  switch (action?.type) {
    case "pair": {
      const tr = editor.state.tr.insertText(action.open + action.close, from, to);
      dispatch(editor, tr.setSelection(TextSelection.create(tr.doc, from + 1)));
      return true;
    }
    case "wrap": {
      // 先插右符号再插左符号（前者位置不受后者影响），保留原选区的 marks
      let tr = editor.state.tr.insertText(action.close, to);
      tr = tr.insertText(action.open, from);
      // 插入 open 使原内容整体右移一位，包裹后保持选中中间内容
      dispatch(editor, tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1)));
      return true;
    }
    case "skip": {
      dispatch(editor, editor.state.tr.setSelection(TextSelection.create(editor.state.doc, to + 1)));
      return true;
    }
    default:
      return false;
  }
}

function handleBackspace(editor: Editor): boolean {
  if (editor.view.composing) {
    return false;
  }
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (!empty || from === 0) {
    return false;
  }
  const prevChar = state.doc.textBetween(from - 1, from, "", "");
  const nextChar = state.doc.textBetween(to, to + 1, "", "");
  if (!shouldDeletePair(prevChar, nextChar)) {
    return false;
  }
  dispatch(editor, state.tr.delete(from - 1, to + 1));
  return true;
}

/**
 * WYSIWYG 编辑器的自动符号配对扩展：输入 ( [ { ' " ` 自动补全右符号、
 * 选区包裹、闭合符跳过、Backspace 成对删除。决策规则与 Raw 模式共享
 * （utils/auto-pair.ts），保证两种编辑模式行为一致。
 */
export const AutoPairing = Extension.create({
  name: "autoPairing",

  addKeyboardShortcuts() {
    const handlers: Record<string, () => boolean> = {};
    for (const char of Object.keys(AUTO_PAIRS)) {
      handlers[char] = () => handlePairKey(this.editor, char);
    }
    for (const closer of PURE_CLOSERS) {
      handlers[closer] = () => handlePairKey(this.editor, closer);
    }
    handlers.Backspace = () => handleBackspace(this.editor);
    return handlers;
  },
});
