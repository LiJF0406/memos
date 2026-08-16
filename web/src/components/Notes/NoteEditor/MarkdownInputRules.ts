import { Extension, InputRule } from "@tiptap/core";

// 输入 `[text](url) `（末尾空格触发）后实时转为可点击链接。
export const LINK_INPUT_RULE = /(?:^|\s)\[([^\]]+)\]\((\S+?)\)\s$/;
// 输入 `![alt](url) `（末尾空格触发）后实时插入图片节点。
export const IMAGE_INPUT_RULE = /(?:^|\s)!\[([^\]]*)\]\((\S+?)\)\s$/;

// 与 @tiptap/extension-link 的默认 protocols 保持一致。
const SAFE_HREF_PREFIX = /^(https?:\/\/|mailto:|tel:|ftp:\/\/|\/|\.\/|#)/i;

/**
 * 实时 Markdown 输入转换（仅 notes 编辑器）：输入链接/图片语法后立即
 * 渲染为对应节点，而不是停留在纯文本。链接转换复用 setLink 命令的
 * URL 校验；非法 URL 保持原样文本，便于用户修正。
 */
export const MarkdownInputRules = Extension.create({
  name: "markdownInputRules",

  addInputRules() {
    return [
      new InputRule({
        find: LINK_INPUT_RULE,
        handler: ({ range, match, chain }) => {
          const [, text, href] = match;
          if (!SAFE_HREF_PREFIX.test(href)) {
            return null;
          }
          const start = range.from + match[0].indexOf("[");
          chain().deleteRange({ from: start, to: range.to }).insertContent(`${text} `).setLink({ href }).run();
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
