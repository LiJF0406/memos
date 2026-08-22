/**
 * 自动符号配对的核心决策逻辑，被 Raw 模式 textarea 和 Tiptap WYSIWYG
 * 扩展共用。纯函数、不触碰 DOM/ProseMirror，便于单测覆盖全部分支。
 */

// 左符号 → 右符号映射；' " ` 既是左也是右（自配对）。
export const AUTO_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "'": "'",
  '"': '"',
  "`": "`",
};

// 纯闭合符号（不自配对）：) ] }
export const PURE_CLOSERS = new Set([")", "]", "}"]);

/** 输入一个符号时编辑器应执行的动作。 */
export type AutoPairAction =
  | { type: "wrap"; open: string; close: string } // 用一对符号包裹当前选区
  | { type: "pair"; open: string; close: string } // 光标处插入一对符号
  | { type: "skip" } // 输入闭合符但右侧已有相同字符 → 仅光标跳过
  | null; // 不拦截，走默认输入

const WORD_CHAR = /[a-zA-Z0-9_]/;

function isBoundary(char: string): boolean {
  return char === "" || !WORD_CHAR.test(char);
}

/**
 * 引号类（' " `）的自动配对启发式：仅当光标前后都不是 word 字符时才
 * 配对，避免 don't / it's 这类缩写被拆成 don''t（对齐 VS Code 行为）。
 */
function canAutoPairQuote(prevChar: string, nextChar: string, quote: string): boolean {
  if (!isBoundary(prevChar)) {
    return false;
  }
  // 前一字符是相同引号且后方为边界 → 视为想连续输入字面引号（防 ''' 连打错乱）
  if (prevChar === quote && isBoundary(nextChar)) {
    return false;
  }
  return isBoundary(nextChar);
}

/**
 * 主决策函数。
 * @param input 单个按键字符
 * @param prevChar 光标前一字符（行首为 ""）
 * @param nextChar 光标后一字符（行尾为 ""）
 * @param selectedText 当前选区文本（空串表示无选区）
 */
export function resolveAutoPair(input: string, prevChar: string, nextChar: string, selectedText: string): AutoPairAction {
  const close = AUTO_PAIRS[input];
  if (close === undefined) {
    // 纯闭合符号：右侧已有相同字符 → 跳过而非重复插入
    if (PURE_CLOSERS.has(input) && nextChar === input) {
      return { type: "skip" };
    }
    return null;
  }
  const isQuote = input === close;
  // 选区包裹对所有可配对符号生效（用户意图明确），不受词边界限制。
  if (selectedText.length > 0) {
    return { type: "wrap", open: input, close };
  }
  if (isQuote) {
    // 自配对引号：右侧已是相同引号 → 跳过（如 '| 中间再打 ' 时退出空对）
    if (nextChar === input) {
      return { type: "skip" };
    }
    if (!canAutoPairQuote(prevChar, nextChar, input)) {
      return null;
    }
    return { type: "pair", open: input, close };
  }
  // 括号类：无条件自动配对
  return { type: "pair", open: input, close };
}

/** Backspace 成对删除判断：空选区且光标恰好夹在一对符号中间。 */
export function shouldDeletePair(prevChar: string, nextChar: string): boolean {
  return AUTO_PAIRS[prevChar] !== undefined && AUTO_PAIRS[prevChar] === nextChar;
}
