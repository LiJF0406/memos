import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { MarkdownRenderContext, rootMarkdownRenderContext } from "@/components/MemoContent/MarkdownRenderContext";
import { buildMemoMarkdownComponents } from "@/components/MemoContent/MemoMarkdownRenderer";

// Mirrors the NotePreview rendering path: shared memo components + remarkGfm.
const renderPreview = (content: string): string =>
  renderToStaticMarkup(
    <MarkdownRenderContext.Provider value={rootMarkdownRenderContext}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...buildMemoMarkdownComponents(new Set()),
          input: ({ node: _node, ...props }) => <input {...props} disabled />,
        }}
      >
        {content}
      </ReactMarkdown>
    </MarkdownRenderContext.Provider>,
  );

describe("note preview markdown formatting", () => {
  it("renders headings with shared styling classes", () => {
    const html = renderPreview("# 一级标题\n\n## 二级标题\n\n### 三级标题");

    expect(html).toContain("<h1");
    expect(html).toContain("text-3xl font-bold");
    expect(html).toContain("text-2xl font-semibold");
    expect(html).toContain("text-xl font-semibold");
  });

  it("renders blockquotes with the shared accent style", () => {
    const html = renderPreview("> 引用内容");

    expect(html).toContain('class="my-0 mb-2 border-l-4 border-primary/30 pl-3 text-muted-foreground italic"');
    expect(html).toContain("<blockquote");
  });

  it("renders task lists from GFM", () => {
    const html = renderPreview("- [ ] 待办\n- [x] 已完成");

    expect(html).toContain("contains-task-list");
    expect(html).toContain("task-list-item");
    expect(html).toContain('type="checkbox"');
  });
});
