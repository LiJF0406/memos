import type { Editor as EditorInstance } from "@tiptap/core";
import { act, createEvent, fireEvent, render } from "@testing-library/react";
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
  // biome-ignore lint/style/noNonNullAssertion: 测试环境里 ProseMirror 元素必然存在
  const proseMirrorEl = container.querySelector(".ProseMirror")!;
  const editor = (proseMirrorEl as HTMLElement & { editor?: EditorInstance }).editor as EditorInstance;
  return { ref, editor, proseMirrorEl };
}

/** 在 ProseMirror 可编辑元素上派发 keydown，返回原始事件以便断言 defaultPrevented。 */
function pressKey(proseMirrorEl: Element, key: string): KeyboardEvent {
  const event = createEvent.keyDown(proseMirrorEl, { key });
  fireEvent(proseMirrorEl, event);
  return event;
}

describe("WYSIWYG 自动符号配对扩展", () => {
  it("空文档输入 ( 补全为 () 且光标落在中间", () => {
    const { ref, editor, proseMirrorEl } = setup("");
    let event: KeyboardEvent;
    act(() => {
      event = pressKey(proseMirrorEl, "(");
    });
    expect(event!.defaultPrevented).toBe(true);
    expect(ref.current?.getMarkdown()).toBe("()");
    expect(editor.state.selection.from).toBe(2);
    expect(editor.state.selection.empty).toBe(true);
  });

  it("行中输入 [ 时在光标处插入成对符号", () => {
    const { ref, editor, proseMirrorEl } = setup("ab");
    act(() => {
      editor.commands.setTextSelection(2);
      pressKey(proseMirrorEl, "[");
    });
    // markdown 序列化时 [ ] 属于需转义字符，文档文本实际为 a[]b
    expect(ref.current?.getMarkdown()).toBe("a\\[\\]b");
    expect(editor.state.selection.from).toBe(3);
  });

  it("有选区时用括号包裹并保持选中内部内容", () => {
    const { ref, editor, proseMirrorEl } = setup("hello");
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 });
      pressKey(proseMirrorEl, "(");
    });
    expect(ref.current?.getMarkdown()).toBe("(hello)");
    expect(editor.state.selection.from).toBe(2);
    expect(editor.state.selection.to).toBe(7);
  });

  it("输入闭合符时右侧已有相同字符则跳过且不重复插入", () => {
    const { ref, editor, proseMirrorEl } = setup("");
    act(() => {
      pressKey(proseMirrorEl, "(");
    });
    expect(ref.current?.getMarkdown()).toBe("()");
    act(() => {
      pressKey(proseMirrorEl, ")");
    });
    // 光标从中间跳到右侧闭合符之后，文档不变
    expect(ref.current?.getMarkdown()).toBe("()");
    expect(editor.state.selection.from).toBe(3);
  });

  it("边界环境输入引号自动配对，词边界内不拦截（don't 场景）", () => {
    const { ref, proseMirrorEl } = setup("");
    act(() => {
      pressKey(proseMirrorEl, "'");
    });
    expect(ref.current?.getMarkdown()).toBe("''");

    // don't 缩写：前一字符是 word 字符，引号不自动配对
    const { ref: ref2, editor, proseMirrorEl: el2 } = setup("don");
    let event: KeyboardEvent;
    act(() => {
      editor.commands.setTextSelection(4);
      event = pressKey(el2, "'");
    });
    expect(event!.defaultPrevented).toBe(false);
    expect(ref2.current?.getMarkdown()).toBe("don");
  });

  it("光标夹在一对符号中间按 Backspace 成对删除", () => {
    const { ref, editor, proseMirrorEl } = setup("()");
    act(() => {
      editor.commands.setTextSelection(2);
      pressKey(proseMirrorEl, "Backspace");
    });
    expect(ref.current?.getMarkdown()).toBe("");
  });

  it("非配对位置的 Backspace 不拦截", () => {
    const { ref, editor, proseMirrorEl } = setup("abc");
    let event: KeyboardEvent;
    act(() => {
      editor.commands.setTextSelection(3);
      event = pressKey(proseMirrorEl, "Backspace");
    });
    expect(event!.defaultPrevented).toBe(false);
    expect(ref.current?.getMarkdown()).toBe("abc");
  });
});
