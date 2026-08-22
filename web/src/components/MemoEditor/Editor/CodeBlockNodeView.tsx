import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { codeBlockStyles } from "@/lib/markdownStyles";
import { cn } from "@/lib/utils";
import { copyText } from "@/utils/clipboard";
import { ensureHighlightTheme, isAppliedDarkTheme } from "@/utils/highlightTheme";

/**
 * Editor NodeView for fenced code blocks, mirroring the read-only memo view
 * (MemoContent/CodeBlock.tsx): rounded frame, language label + copy button in
 * the header, and highlight.js syntax coloring via the lowlight decoration
 * plugin. The <code> element is the editable ProseMirror content; the header
 * chrome is non-editable. The copy button uses preventDefault on mousedown so
 * clicking it does not move the cursor/focus out of the code.
 */
export function CodeBlockNodeView({ node }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = (node.attrs?.language as string | undefined) ?? "";
  const codeContent = node.textContent ?? "";

  // Keep the highlight.js theme in sync with the app's applied theme (reads the
  // resolved `data-theme` on <html> instead of the auth user setting, so the
  // editor stays usable in contexts without an AuthProvider). A MutationObserver
  // reactively swaps the <style> when the theme changes.
  useEffect(() => {
    void ensureHighlightTheme(isAppliedDarkTheme());
    const observer = new MutationObserver(() => {
      void ensureHighlightTheme(isAppliedDarkTheme());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const handleCopy = async () => {
    const success = await copyText(codeContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <NodeViewWrapper className={codeBlockStyles.frame}>
      <div className={codeBlockStyles.header} contentEditable={false}>
        <span className={codeBlockStyles.label}>{language || "text"}</span>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => {
            void handleCopy();
          }}
          className={cn(codeBlockStyles.copyButtonBase, copied ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          aria-label={copied ? "Copied" : "Copy code"}
          title={copied ? "Copied!" : "Copy code"}
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className={codeBlockStyles.codeWrap}>
        <NodeViewContent
          as={"code" as unknown as "div"}
          className={cn(codeBlockStyles.code, `language-${language}`)}
          style={{ whiteSpace: "pre" }}
        />
      </div>
    </NodeViewWrapper>
  );
}
