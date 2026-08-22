import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { CheckIcon, CopyIcon } from "lucide-react";
import { isValidElement, type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { codeBlockStyles } from "@/lib/markdownStyles";
import { cn } from "@/lib/utils";
import { copyText } from "@/utils/clipboard";
import { ensureHighlightTheme, isDarkThemeFromSettings } from "@/utils/highlightTheme";
import { MermaidBlock } from "./MermaidBlock";
import type { ReactMarkdownProps } from "./markdown/types";
import { extractCodeContent, extractLanguage } from "./utils";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("sh", shell);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);

interface CodeBlockProps extends ReactMarkdownProps {
  children?: ReactNode;
  className?: string;
}

export const CodeBlock = ({ children, className, node: _node, ...props }: CodeBlockProps) => {
  const { userGeneralSetting } = useAuth();
  const [copied, setCopied] = useState(false);

  const codeElement = isValidElement(children) ? (children as ReactElement<{ className?: string }>) : null;
  const codeClassName = codeElement?.props.className || "";
  const codeContent = extractCodeContent(children);
  const language = extractLanguage(codeClassName);

  // If it's a mermaid block, render with MermaidBlock component
  if (language === "mermaid") {
    return (
      <pre className="relative">
        <MermaidBlock className={cn(className)} {...props}>
          {children}
        </MermaidBlock>
      </pre>
    );
  }

  // Dynamically load the highlight.js theme matching the app theme.
  const isDarkTheme = isDarkThemeFromSettings(userGeneralSetting?.theme);

  useEffect(() => {
    void ensureHighlightTheme(isDarkTheme);
  }, [isDarkTheme]);

  // Highlight code using highlight.js
  const highlightedCode = useMemo(() => {
    try {
      const lang = hljs.getLanguage(language);
      if (lang) {
        return hljs.highlight(codeContent, {
          language: language,
        }).value;
      }
    } catch {
      // Skip error and use default highlighted code.
    }

    // Escape any HTML entities when rendering original content.
    return Object.assign(document.createElement("span"), {
      textContent: codeContent,
    }).innerHTML;
  }, [language, codeContent]);

  const handleCopy = async () => {
    const success = await copyText(codeContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <pre className={codeBlockStyles.frame}>
      {/* Header with language label and copy button */}
      <div className={codeBlockStyles.header}>
        <span className={codeBlockStyles.label}>{language || "text"}</span>
        <button
          onClick={handleCopy}
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

      {/* Code content */}
      <div className={codeBlockStyles.codeWrap}>
        <code className={cn(codeBlockStyles.code, `language-${language}`)} dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </div>
    </pre>
  );
};
