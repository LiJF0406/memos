import { Extension, InputRule } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

// 输入 `[text](url) `（末尾空格触发）后实时转为可点击链接。
export const LINK_INPUT_RULE = /(?:^|\s)\[([^\]]+)\]\((\S+?)\)\s$/;
// 输入 `![alt](url) `（末尾空格触发）后实时插入图片节点。
export const IMAGE_INPUT_RULE = /(?:^|\s)!\[([^\]]*)\]\((\S+?)\)\s$/;

// 与 @tiptap/extension-link 的默认 protocols 保持一致。
const SAFE_HREF_PREFIX = /^(https?:\/\/|mailto:|tel:|ftp:\/\/|\/|\.\/|#)/i;

interface InputRange {
  from: number;
  to: number;
}

/**
 * 把 `[text](url) ` 语法段转换为带 link mark 的文本：删除语法原文后
 * 直接插入带 mark 的文本节点（setMark 命令在空选区下只设置 stored
 * mark，无法应用到已有文本）。返回 false 表示 URL 不合法，保持原样
 * 文本。调用方负责 dispatch 传入的 transaction。
 */
export function applyLinkInputRule(tr: Transaction, range: InputRange, match: RegExpMatchArray): boolean {
  const [, text, href] = match;
  if (!SAFE_HREF_PREFIX.test(href)) {
    return false;
  }
  const start = range.from + match[0].indexOf("[");
  const schema = tr.doc.type.schema;
  const linkMark = schema.marks.link.create({ href });
  tr.deleteRange(start, range.to);
  tr.insert(start, Fragment.from([schema.text(text, [linkMark]), schema.text(" ")]));
  return true;
}

/**
 * 实时 Markdown 输入转换（仅 notes 编辑器）：输入链接/图片语法后立即
 * 渲染为对应节点，而不是停留在纯文本。非法 URL 保持原样文本，便于
 * 用户修正。
 */
export const MarkdownInputRules = Extension.create({
  name: "markdownInputRules",

  addInputRules() {
    return [
      new InputRule({
        find: LINK_INPUT_RULE,
        handler: ({ state, range, match }) => {
          applyLinkInputRule(state.tr, range, match);
        },
      }),
      new InputRule({
        find: IMAGE_INPUT_RULE,
        handler: ({ state, range, match }) => {
          const [, alt, src] = match;
          const start = range.from + match[0].indexOf("![");
          const image = state.schema.nodes.image?.create({ src, alt });
          if (!image) {
            return null;
          }
          state.tr.replaceRangeWith(start, range.to, image);
        },
      }),
    ];
  },
});
