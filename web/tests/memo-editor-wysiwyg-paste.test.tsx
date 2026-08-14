import type { Editor as EditorInstance } from "@tiptap/core";
import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import Editor from "@/components/MemoEditor/Editor";
import type { EditorController } from "@/components/MemoEditor/types/editorController";

vi.mock("@/hooks/useUserQueries", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTagCounts: () => ({ data: {} }),
}));

function setup(initialContent = "") {
  const ref = createRef<EditorController>();
  const { container } = render(
    <Editor ref={ref} initialContent={initialContent} placeholder="memo" onContentChange={vi.fn()} onPaste={vi.fn()} />,
  );
  const proseMirrorEl = container.querySelector(".ProseMirror") as HTMLElement;
  const editor = (proseMirrorEl as HTMLElement & { editor?: EditorInstance }).editor as EditorInstance;
  return { ref, editor, proseMirrorEl };
}

// 纯文本剪贴板：无文件、无 HTML —— 这是 markdown input rules 永远看不到的粘贴
// （它们只对键盘输入生效）。
function pastePlainText(proseMirrorEl: HTMLElement, text: string) {
  fireEvent.paste(proseMirrorEl, {
    clipboardData: {
      getData: (type: string) => (type === "text/plain" || type === "text" ? text : ""),
      items: [],
      types: [],
    },
  });
}

describe("wysiwyg editor markdown paste", () => {
  it("parses a pasted `---` into a horizontal rule", () => {
    const { editor, proseMirrorEl } = setup("");
    act(() => pastePlainText(proseMirrorEl, "---"));
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "horizontalRule" });
  });

  it("parses a pasted `>` line into a blockquote", () => {
    const { editor, proseMirrorEl } = setup("");
    act(() => pastePlainText(proseMirrorEl, "> quoted line"));
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "blockquote" });
  });

  it("parses a pasted fenced block into a code block", () => {
    const { editor, proseMirrorEl } = setup("");
    act(() => pastePlainText(proseMirrorEl, "```\nconst x = 1;\n```"));
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "codeBlock" });
  });

  it("keeps plain text with no markdown as a paragraph", () => {
    const { ref, proseMirrorEl } = setup("");
    act(() => pastePlainText(proseMirrorEl, "hello world"));
    expect(ref.current?.getMarkdown()).toBe("hello world");
  });

  it("still wraps the selected text when pasting a URL over a selection", () => {
    const { ref, editor, proseMirrorEl } = setup("example");
    act(() => {
      editor.commands.selectAll();
    });
    act(() => pastePlainText(proseMirrorEl, "https://example.com"));
    expect(ref.current?.getMarkdown()).toBe("[example](https://example.com)");
  });
});
