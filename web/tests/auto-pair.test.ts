import { describe, expect, it } from "vitest";
import { AUTO_PAIRS, resolveAutoPair, shouldDeletePair } from "@/components/MemoEditor/utils/auto-pair";

/** 便捷封装：默认空上下文（光标在行首/行尾、无选区）。 */
function decide(input: string, opts: { prev?: string; next?: string; selected?: string } = {}) {
  return resolveAutoPair(input, opts.prev ?? "", opts.next ?? "", opts.selected ?? "");
}

describe("AUTO_PAIRS 映射", () => {
  it("包含常用符号集且自配对符号左右一致", () => {
    expect(Object.keys(AUTO_PAIRS).sort()).toEqual(["(", "'", '"', "[", "{"].sort());
    expect(AUTO_PAIRS["("]).toBe(")");
    expect(AUTO_PAIRS["["]).toBe("]");
    expect(AUTO_PAIRS["{"]).toBe("}");
    expect(AUTO_PAIRS["'"]).toBe("'");
    expect(AUTO_PAIRS['"']).toBe('"');
  });
});

describe("resolveAutoPair：括号类", () => {
  it("空光标输入左符号插入成对符号", () => {
    expect(decide("(")).toEqual({ type: "pair", open: "(", close: ")" });
    expect(decide("[")).toEqual({ type: "pair", open: "[", close: "]" });
    expect(decide("{")).toEqual({ type: "pair", open: "{", close: "}" });
  });

  it("括号有选区时包裹选区", () => {
    expect(decide("(", { selected: "hello" })).toEqual({ type: "wrap", open: "(", close: ")" });
    expect(decide("[", { selected: "x" })).toEqual({ type: "wrap", open: "[", close: "]" });
  });

  it("括号在词中间也自动配对", () => {
    expect(decide("(", { prev: "o", next: "w" })).toEqual({ type: "pair", open: "(", close: ")" });
  });

  it("输入纯闭合符号时右侧已有相同字符则跳过", () => {
    expect(decide(")", { next: ")" })).toEqual({ type: "skip" });
    expect(decide("]", { next: "]" })).toEqual({ type: "skip" });
    expect(decide("}", { next: "}" })).toEqual({ type: "skip" });
  });

  it("右侧无相同闭合符号时不拦截", () => {
    expect(decide(")")).toBeNull();
    expect(decide(")", { next: "x" })).toBeNull();
  });
});

describe("resolveAutoPair：引号类", () => {
  it("行首/行尾等边界环境自动配对", () => {
    expect(decide("'")).toEqual({ type: "pair", open: "'", close: "'" });
    expect(decide('"', { prev: " " })).toEqual({ type: "pair", open: '"', close: '"' });
  });

  it("反引号不参与自动配对（交给 code mark 输入规则转换）", () => {
    expect(decide("`")).toBeNull();
    expect(decide("`", { next: " " })).toBeNull();
  });

  it("前一字符是 word 字符时不配对（don't 缩写场景）", () => {
    expect(decide("'", { prev: "n" })).toBeNull();
    expect(decide('"', { prev: "s" })).toBeNull();
  });

  it("后一字符是 word 字符时不配对", () => {
    expect(decide("'", { next: "a" })).toBeNull();
    expect(decide('"', { prev: " ", next: "b" })).toBeNull();
  });

  it("中文相邻视为边界，允许配对", () => {
    expect(decide('"', { prev: "说" })).toEqual({ type: "pair", open: '"', close: '"' });
    expect(decide("'", { next: "字" })).toEqual({ type: "pair", open: "'", close: "'" });
  });

  it("右侧已是相同引号时跳过（退出空对）", () => {
    expect(decide("'", { next: "'" })).toEqual({ type: "skip" });
    expect(decide('"', { next: '"' })).toEqual({ type: "skip" });
  });

  it("前一同类引号且后方为边界时按字面输入（防 ''' 连打错乱）", () => {
    expect(decide("'", { prev: "'" })).toBeNull();
    expect(decide("'", { prev: "'", next: " " })).toBeNull();
  });

  it("引号有选区时包裹，不受词边界限制", () => {
    expect(decide('"', { selected: "quoted" })).toEqual({ type: "wrap", open: '"', close: '"' });
    expect(decide("'", { prev: "n", selected: "it" })).toEqual({ type: "wrap", open: "'", close: "'" });
  });
});

describe("resolveAutoPair：其他字符", () => {
  it("不可配对的字符一律不拦截", () => {
    expect(decide("a")).toBeNull();
    expect(decide(" ")).toBeNull();
    expect(decide("<")).toBeNull();
  });
});

describe("shouldDeletePair：成对删除判断", () => {
  it("光标夹在一对符号中间时可成对删除", () => {
    expect(shouldDeletePair("(", ")")).toBe(true);
    expect(shouldDeletePair("[", "]")).toBe(true);
    expect(shouldDeletePair("{", "}")).toBe(true);
    expect(shouldDeletePair("'", "'")).toBe(true);
    expect(shouldDeletePair('"', '"')).toBe(true);
  });

  it("非配对组合不删除", () => {
    expect(shouldDeletePair("(", "x")).toBe(false);
    expect(shouldDeletePair("a", ")")).toBe(false);
    expect(shouldDeletePair("x", "y")).toBe(false);
    // 左右顺序颠倒不是一对
    expect(shouldDeletePair(")", "(")).toBe(false);
  });
});
