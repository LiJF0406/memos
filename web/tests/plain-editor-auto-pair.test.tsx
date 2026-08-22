import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import PlainEditor from "@/components/MemoEditor/PlainEditor";
import type { EditorController } from "@/components/MemoEditor/types/editorController";

function setup(initialContent = "") {
  const ref = createRef<EditorController>();
  const onContentChange = vi.fn();
  render(
    <PlainEditor
      ref={ref}
      className=""
      initialContent={initialContent}
      placeholder="memo"
      onContentChange={onContentChange}
      onPaste={vi.fn()}
    />,
  );
  const textarea = screen.getByPlaceholderText("memo") as HTMLTextAreaElement;
  return { textarea, onContentChange };
}

/** 在指定光标处派发 keydown，返回原始事件以便断言 defaultPrevented。 */
function press(textarea: HTMLTextAreaElement, key: string, caretStart?: number, caretEnd?: number): Event {
  const position = caretStart ?? textarea.value.length;
  textarea.setSelectionRange(position, caretEnd ?? position);
  const event = createEvent.keyDown(textarea, { key });
  fireEvent(textarea, event);
  return event;
}

describe("PlainEditor 自动符号配对", () => {
  it("空内容输入 ( 补全为 () 且光标落在中间", () => {
    const { textarea, onContentChange } = setup();
    const event = press(textarea, "(");
    expect(event.defaultPrevented).toBe(true);
    expect(textarea.value).toBe("()");
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(1);
    expect(onContentChange).toHaveBeenLastCalledWith("()");
  });

  it("行中输入 [ 时在光标处插入成对符号", () => {
    const { textarea } = setup("abc");
    press(textarea, "[", 1);
    expect(textarea.value).toBe("a[]bc");
    expect(textarea.selectionStart).toBe(2);
  });

  it("有选区时用括号包裹并保持选中内部内容", () => {
    const { textarea } = setup("abcd");
    press(textarea, "{", 1, 3);
    expect(textarea.value).toBe("a{bc}d");
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(4);
  });

  it("输入闭合符时右侧已有相同字符则跳过", () => {
    const { textarea } = setup("()");
    press(textarea, ")", 1);
    expect(textarea.value).toBe("()");
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);
  });

  it("边界环境输入引号自动配对", () => {
    const { textarea } = setup("");
    press(textarea, '"');
    expect(textarea.value).toBe('""');
    expect(textarea.selectionStart).toBe(1);
  });

  it("前一字符是 word 字符时引号不拦截（don't 缩写场景）", () => {
    const { textarea } = setup("don");
    const event = press(textarea, "'");
    expect(event.defaultPrevented).toBe(false);
    expect(textarea.value).toBe("don");
  });

  it("右侧已是相同引号时光标跳过", () => {
    const { textarea } = setup("''");
    press(textarea, "'", 1);
    expect(textarea.value).toBe("''");
    expect(textarea.selectionStart).toBe(2);
  });

  it("反引号自动配对（行内代码场景）", () => {
    const { textarea } = setup("");
    press(textarea, "`");
    expect(textarea.value).toBe("``");
    expect(textarea.selectionStart).toBe(1);
  });

  it("光标夹在一对符号中间按 Backspace 成对删除", () => {
    const { textarea, onContentChange } = setup("()");
    press(textarea, "Backspace", 1);
    expect(textarea.value).toBe("");
    expect(textarea.selectionStart).toBe(0);
    expect(onContentChange).toHaveBeenLastCalledWith("");
  });

  it("非配对位置的 Backspace 不拦截", () => {
    const { textarea } = setup("(x)");
    const event = press(textarea, "Backspace", 2);
    expect(event.defaultPrevented).toBe(false);
    expect(textarea.value).toBe("(x)");
  });

  it("IME 组合期按键不拦截", () => {
    const { textarea } = setup();
    textarea.setSelectionRange(0, 0);
    const event = createEvent.keyDown(textarea, { key: "(", isComposing: true });
    fireEvent(textarea, event);
    expect(event.defaultPrevented).toBe(false);
    expect(textarea.value).toBe("");
  });

  it("多字符按键（如 Enter、Shift）不拦截", () => {
    const { textarea } = setup();
    const enterEvent = press(textarea, "Enter");
    const shiftEvent = press(textarea, "Shift");
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(shiftEvent.defaultPrevented).toBe(false);
    expect(textarea.value).toBe("");
  });
});
